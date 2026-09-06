/**
 * Real-Postgres tests for `createPostgresStaffNotificationStore` and the
 * end-to-end notification pipeline it completes.
 *
 * The gap this closes: D-085 made the outbox durable, but the sink it
 * delivered into was a per-process `Map`, so a notification marked
 * `DELIVERED` existed only in one instance's heap. These tests assert the
 * two properties that were previously impossible — that a delivered
 * notification is readable from a *separately constructed* store (the
 * restart/other-instance proof), and that redelivering the same outbox
 * event cannot produce a second notification.
 *
 * Each test scopes itself to unique ids so a shared table and repeated runs
 * cannot let an assertion pass by accident.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresStaffNotificationStore } from '../../src/lib/db/postgres-staff-notification-store';
import { createPostgresOutboxStore } from '../../src/lib/db/postgres-outbox-store';
import { createStaffNotificationHandler } from '../../src/modules/staff/notification-handlers';
import { runDispatchCycle, type OutboxHandler } from '../../src/lib/domain/outbox-dispatcher';
import type { StaffNotification } from '../../src/modules/staff/notification-store';
import type { EntityType } from '../../src/lib/domain/status-event';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const configured = Boolean(url && serviceRoleKey);

function serviceClient() {
  return createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe.skipIf(!configured)('createPostgresStaffNotificationStore (real Postgres)', () => {
  const client = serviceClient();
  const store = createPostgresStaffNotificationStore(client);
  const createdIds: string[] = [];

  function notification(overrides: Partial<StaffNotification> = {}): StaffNotification {
    const id = overrides.id ?? randomUUID();
    createdIds.push(id);
    return {
      id,
      eventType: 'booking_request.requested',
      entityType: 'BOOKING_REQUEST' as EntityType,
      entityId: randomUUID(),
      payload: { requestId: randomUUID(), state: 'REQUESTED' },
      deliveredAt: new Date().toISOString(),
      readAt: null,
      ...overrides,
    };
  }

  afterAll(async () => {
    for (const id of createdIds) {
      await client.from('staff_notifications').delete().eq('id', id);
    }
  });

  it('round-trips every mapped field', async () => {
    const record = notification();
    await store.upsert(record);

    const found = (await store.list()).find((n) => n.id === record.id);
    expect(found).toEqual(record);
  });

  it('survives a separately constructed store over a separate client', async () => {
    // The restart proof: this read shares no process memory with the write
    // above, so a record that comes back existed in Postgres and would
    // equally be visible to a different serverless instance.
    const record = notification();
    await store.upsert(record);

    const freshStore = createPostgresStaffNotificationStore(serviceClient());
    const found = (await freshStore.list()).find((n) => n.id === record.id);
    expect(found?.entityId).toBe(record.entityId);
  });

  it('upserting the same id twice leaves exactly one row', async () => {
    const record = notification();
    await store.upsert(record);
    await store.upsert({ ...record, deliveredAt: new Date(Date.now() + 1000).toISOString() });

    const matching = (await store.list()).filter((n) => n.id === record.id);
    expect(matching).toHaveLength(1);
  });

  it('a redelivery never resurrects an already-read notification as unread', async () => {
    // The dispatcher can legitimately hand the same event to a handler
    // twice. If that re-write reset `read_at`, staff would see work they
    // had already cleared reappear as new.
    const record = notification();
    await store.upsert(record);
    await store.markRead(record.id, new Date());

    await store.upsert(record);

    const found = (await store.list()).find((n) => n.id === record.id);
    expect(found?.readAt).not.toBeNull();
  });

  it('marks read durably, visible to a separate store instance', async () => {
    const record = notification();
    await store.upsert(record);
    expect((await store.list()).find((n) => n.id === record.id)?.readAt).toBeNull();

    await store.markRead(record.id, new Date());

    const freshStore = createPostgresStaffNotificationStore(serviceClient());
    const found = (await freshStore.list()).find((n) => n.id === record.id);
    expect(found?.readAt).not.toBeNull();
  });

  it('marking an unknown id is a no-op rather than an error', async () => {
    await expect(store.markRead(randomUUID(), new Date())).resolves.toBeUndefined();
  });

  it('lists newest first', async () => {
    const older = notification({ deliveredAt: new Date(Date.now() - 60_000).toISOString() });
    const newer = notification({ deliveredAt: new Date().toISOString() });
    await store.upsert(older);
    await store.upsert(newer);

    const listed = (await store.list()).filter((n) => [older.id, newer.id].includes(n.id));
    expect(listed.map((n) => n.id)).toEqual([newer.id, older.id]);
  });
});

describe.skipIf(!configured)('outbox dispatch produces durable staff notifications', () => {
  const client = serviceClient();
  const outbox = createPostgresOutboxStore(client);
  const notifications = createPostgresStaffNotificationStore(client);
  const createdOutboxIds: string[] = [];

  afterAll(async () => {
    for (const id of createdOutboxIds) {
      await client.from('outbox_events').delete().eq('id', id);
      // The notification shares the outbox event's id.
      await client.from('staff_notifications').delete().eq('id', id);
    }
  });

  async function seedOutboxRow(entityType: EntityType, eventType: string, destination: string) {
    const id = randomUUID();
    createdOutboxIds.push(id);
    await outbox.append({
      id,
      version: 1,
      eventType,
      entityType,
      entityId: randomUUID(),
      payload: { state: 'REQUESTED' },
      destination,
      status: 'PENDING',
      attemptCount: 0,
      nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
      claimedAt: null,
      deliveredAt: null,
      failedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  /** The real handler, over the real Postgres notification store. */
  function handlers(destination: string): Record<string, OutboxHandler> {
    return { [destination]: createStaffNotificationHandler(notifications) };
  }

  it.each([
    ['BOOKING_REQUEST', 'booking_request.requested'],
    ['EVENT_REQUEST', 'event_request.requested'],
    ['TAKEAWAY_REQUEST', 'takeaway_request.requested'],
  ])('dispatching a %s event creates exactly one durable notification', async (entity, event) => {
    const destination = `test.${randomUUID()}`;
    const id = await seedOutboxRow(entity as EntityType, event, destination);

    await runDispatchCycle({ store: outbox, handlers: handlers(destination) });

    // Read through a separate store/client: durable, not in-process state.
    const freshStore = createPostgresStaffNotificationStore(serviceClient());
    const matching = (await freshStore.list()).filter((n) => n.id === id);
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({ eventType: event, entityType: entity, readAt: null });
  });

  it('a repeated dispatch of the same event does not create a second notification', async () => {
    const destination = `test.${randomUUID()}`;
    const id = await seedOutboxRow('BOOKING_REQUEST', 'booking_request.requested', destination);

    await runDispatchCycle({ store: outbox, handlers: handlers(destination) });

    // Force the row back to a claimable state, exactly as a dispatcher that
    // died after the handler succeeded but before marking DELIVERED would
    // leave it, then dispatch again.
    await client
      .from('outbox_events')
      .update({ status: 'PENDING', delivered_at: null, next_attempt_at: new Date().toISOString() })
      .eq('id', id);
    await runDispatchCycle({ store: outbox, handlers: handlers(destination) });

    const matching = (await notifications.list()).filter((n) => n.id === id);
    expect(matching).toHaveLength(1);
  });
});

describe.skipIf(!configured || !anonKey)('staff_notifications is not readable by guests', () => {
  it('the anon role reads no rows, whatever exists in the table', async () => {
    const service = serviceClient();
    const id = randomUUID();
    await service.from('staff_notifications').insert({
      id,
      event_type: 'booking_request.requested',
      entity_type: 'BOOKING_REQUEST',
      entity_id: randomUUID(),
      payload: {},
      delivered_at: new Date().toISOString(),
    });

    // The anon key is exactly what a guest's browser uses. RLS has no
    // policy for `anon` on this table, so the row must be invisible —
    // whether that surfaces as an error or an empty result, it must never
    // be the row.
    const guest = createClient(url ?? '', anonKey ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await guest.from('staff_notifications').select('id').eq('id', id);
    expect(data ?? []).toEqual([]);

    await service.from('staff_notifications').delete().eq('id', id);
  });
});
