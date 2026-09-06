/**
 * End-to-end proof for the durable outbox cutover (D-085).
 *
 * `tests/integration/postgres-outbox-store.test.ts` already proves the
 * adapter correct in isolation — claim limits, stale reclaim, concurrent
 * claims, version-checked resolution. What it cannot prove is the thing
 * the cutover is actually about: that a *real domain submission* leaves a
 * durable row behind, for every domain that shares the singleton, and that
 * the scheduled dispatcher then drives that row to a terminal state.
 *
 * The failure this guards against is precisely what production was doing
 * before the cutover: booking rows written durably while the notification
 * telling staff about them lived in one instance's heap, so `outbox_events`
 * stayed empty and nobody was told.
 *
 * Every test scopes itself to a unique `destination`, so a shared table and
 * repeated runs cannot let an assertion pass by accident.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresOutboxStore } from '../../src/lib/db/postgres-outbox-store';
import { createPostgresBookingDeps } from '../../src/modules/bookings/deps';
import { createPostgresEventDeps } from '../../src/modules/events/deps';
import {
  prepareBookingRequest,
  submitBookingRequest,
} from '../../src/modules/bookings/submission-service';
import {
  prepareEventRequest,
  submitEventRequest,
} from '../../src/modules/events/submission-service';
import {
  prepareTakeawayRequest,
  submitTakeawayRequest,
  type TakeawayServiceDeps,
} from '../../src/modules/takeaway/submission-service';
import { addItemToCart, emptyCart } from '../../src/modules/takeaway/cart';
import { createInMemoryConfirmationTokenStore } from '../../src/lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../src/lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { runDispatchCycle, type OutboxHandler } from '../../src/lib/domain/outbox-dispatcher';
import type { OutboxStore } from '../../src/lib/domain/outbox-store';
import type { PublishedMenuView } from '../../src/modules/menu/menu-view';
import type {
  TakeawayItemSnapshot,
  TakeawayRequestRecord,
} from '../../src/modules/takeaway/request';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

const GUEST = { guestName: 'Aamir', guestPhone: '+923001234567' };

const MENU: PublishedMenuView = {
  status: 'PUBLISHED',
  versionNumber: 1,
  categories: [
    {
      id: 'cat-1',
      mediaKey: 'steaks',
      name: 'Steaks',
      items: [
        {
          id: 'steaks.ribeye',
          name: 'Ribeye',
          groupLabel: null,
          availability: 'AVAILABLE',
          basePricePkr: 3500,
          variants: [],
          isSignature: false,
          serves: null,
          servedWith: null,
        },
      ],
    },
  ],
};

describe.skipIf(!configured)('durable outbox cutover (real Postgres)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const outbox = createPostgresOutboxStore(client);
  const createdRequestIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdSessionIds: string[] = [];

  function session(): string {
    const id = randomUUID();
    createdSessionIds.push(id);
    return id;
  }

  afterAll(async () => {
    for (const id of createdRequestIds) {
      await client.from('booking_requests').delete().eq('id', id);
    }
    for (const id of createdEventIds) {
      await client.from('event_requests').delete().eq('id', id);
    }
    for (const id of createdSessionIds) {
      await client.from('customer_sessions').delete().eq('id', id);
    }
    // outbox_events rows written here are scoped to unique destinations and
    // are cleaned up per-test where they would otherwise accumulate.
  });

  /**
   * Reads a domain's outbox rows back through a **separately constructed**
   * store over a **separate client**. That is the restart-semantics proof:
   * nothing in this read can see the writer's process memory, so a row that
   * comes back existed in Postgres and would equally survive the writing
   * instance being recycled.
   */
  async function readBackFresh(entityId: string) {
    const freshClient = createClient(url ?? '', serviceRoleKey ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const freshStore = createPostgresOutboxStore(freshClient);
    const all = await freshStore.list();
    return all.filter((e) => e.entityId === entityId);
  }

  it('a real booking submission leaves a durable outbox row', async () => {
    const sessionId = session();
    const deps = { ...createPostgresBookingDeps(client), outbox };
    const draft = {
      ...GUEST,
      requestedDate: '2026-10-10',
      requestedTime: '19:30',
      partySize: 4,
      seatingPreference: 'GENERAL' as const,
      notes: null,
    };
    const prepared = await prepareBookingRequest(deps, { sessionId, ...draft });
    if (!prepared.ok) throw new Error('prepare failed');
    const result = await submitBookingRequest(deps, {
      sessionId,
      ...draft,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: `idem-${randomUUID()}`,
      correlationId: randomUUID(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdRequestIds.push(result.value.requestId);

    const rows = await readBackFresh(result.value.requestId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventType: 'booking_request.requested',
      destination: 'staff_notification',
      status: 'PENDING',
      entityType: 'BOOKING_REQUEST',
    });

    await client.from('outbox_events').delete().eq('id', rows[0]!.id);
  });

  it('a real event submission leaves a durable outbox row', async () => {
    const sessionId = session();
    const deps = { ...createPostgresEventDeps(client), outbox };
    const draft = {
      ...GUEST,
      occasion: 'Birthday',
      requestedDate: '2026-10-11',
      requestedTime: '18:00',
      guestCount: 10,
      decorInterest: true,
      notes: null,
    };
    const prepared = await prepareEventRequest(deps, { sessionId, ...draft });
    if (!prepared.ok) throw new Error('prepare failed');
    const result = await submitEventRequest(deps, {
      sessionId,
      ...draft,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: `idem-${randomUUID()}`,
      correlationId: randomUUID(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdEventIds.push(result.value.requestId);

    const rows = await readBackFresh(result.value.requestId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventType: 'event_request.requested',
      destination: 'staff_notification',
      status: 'PENDING',
      entityType: 'EVENT_REQUEST',
    });

    await client.from('outbox_events').delete().eq('id', rows[0]!.id);
  });

  it('a real takeaway submission leaves a durable outbox row on the same shared store', async () => {
    // Takeaway's other stores are still in-memory (its own cutover is a
    // separate, open task) — but its `outbox` is the shared singleton, so
    // the notification path is durable regardless. That is exactly the
    // property this asserts.
    const deps: TakeawayServiceDeps = {
      getMenuView: async () => MENU,
      confirmationTokens: createInMemoryConfirmationTokenStore(),
      idempotency: createInMemoryIdempotencyStore(),
      requestStore: createInMemoryVersionedStore<TakeawayRequestRecord>(),
      itemSnapshots: createInMemorySink<TakeawayItemSnapshot>(),
      statusEvents: createInMemorySink(),
      auditEvents: createInMemorySink(),
      outbox,
      generateId: randomUUID,
    };
    const added = addItemToCart(emptyCart(randomUUID(), randomUUID(), 1), MENU, {
      menuItemId: 'steaks.ribeye',
      quantity: 2,
    });
    if (!added.ok) throw new Error('cart fixture failed');

    const prepared = await prepareTakeawayRequest(deps, {
      sessionId: added.value.sessionId,
      cart: added.value,
      ...GUEST,
    });
    if (!prepared.ok) throw new Error('prepare failed');
    const result = await submitTakeawayRequest(deps, {
      sessionId: added.value.sessionId,
      cart: added.value,
      ...GUEST,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: `idem-${randomUUID()}`,
      correlationId: randomUUID(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await readBackFresh(result.value.requestId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      destination: 'staff_notification',
      status: 'PENDING',
      entityType: 'TAKEAWAY_REQUEST',
    });

    await client.from('outbox_events').delete().eq('id', rows[0]!.id);
  });

  it('the dispatcher drives a durable row to DELIVERED', async () => {
    const destination = `test.${randomUUID()}`;
    const entityId = randomUUID();
    await outbox.append({
      id: randomUUID(),
      version: 1,
      eventType: 'booking_request.requested',
      entityType: 'BOOKING_REQUEST',
      entityId,
      payload: { requestId: entityId },
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

    const handled: string[] = [];
    const handlers: Record<string, OutboxHandler> = {
      [destination]: async (event) => {
        handled.push(event.entityId);
      },
    };
    const summary = await runDispatchCycle({ store: outbox, handlers });
    expect(summary.delivered).toBeGreaterThanOrEqual(1);
    expect(handled).toContain(entityId);

    const after = (await outbox.list()).filter((e) => e.entityId === entityId);
    expect(after).toHaveLength(1);
    expect(after[0]!.status).toBe('DELIVERED');
    expect(after[0]!.deliveredAt).not.toBeNull();

    await client.from('outbox_events').delete().eq('id', after[0]!.id);
  });

  it('a failing handler returns the row to PENDING and it stays retryable', async () => {
    const destination = `test.${randomUUID()}`;
    const entityId = randomUUID();
    await outbox.append({
      id: randomUUID(),
      version: 1,
      eventType: 'booking_request.requested',
      entityType: 'BOOKING_REQUEST',
      entityId,
      payload: {},
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

    const handlers: Record<string, OutboxHandler> = {
      [destination]: async () => {
        throw new Error('handler unavailable');
      },
    };
    await runDispatchCycle({ store: outbox, handlers });

    const after = (await outbox.list()).filter((e) => e.entityId === entityId);
    expect(after).toHaveLength(1);
    // Durable, not lost, and scheduled to be tried again — never stranded
    // in CLAIMED with nothing coming back for it.
    expect(after[0]!.status).toBe('PENDING');
    expect(after[0]!.attemptCount).toBe(1);
    expect(after[0]!.nextAttemptAt).not.toBeNull();
    expect(after[0]!.lastError).toBeTruthy();

    await client.from('outbox_events').delete().eq('id', after[0]!.id);
  });

  it('a permanently failing row becomes terminal FAILED rather than retrying forever', async () => {
    const destination = `test.${randomUUID()}`;
    const entityId = randomUUID();
    await outbox.append({
      id: randomUUID(),
      version: 1,
      eventType: 'booking_request.requested',
      entityType: 'BOOKING_REQUEST',
      entityId,
      payload: {},
      destination,
      // Already at the attempt ceiling, so this cycle is the last one.
      status: 'PENDING',
      attemptCount: 4,
      nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
      claimedAt: null,
      deliveredAt: null,
      failedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
    });

    const handlers: Record<string, OutboxHandler> = {
      [destination]: async () => {
        throw new Error('still unavailable');
      },
    };
    await runDispatchCycle({ store: outbox, handlers, maxAttempts: 5 });

    const after = (await outbox.list()).filter((e) => e.entityId === entityId);
    expect(after).toHaveLength(1);
    expect(after[0]!.status).toBe('FAILED');
    expect(after[0]!.failedAt).not.toBeNull();

    await client.from('outbox_events').delete().eq('id', after[0]!.id);
  });

  it('two concurrent dispatch cycles never deliver the same row twice, and neither exceeds its limit', async () => {
    const destination = `test.${randomUUID()}`;
    const entityIds = Array.from({ length: 6 }, () => randomUUID());
    for (const entityId of entityIds) {
      await outbox.append({
        id: randomUUID(),
        version: 1,
        eventType: 'booking_request.requested',
        entityType: 'BOOKING_REQUEST',
        entityId,
        payload: {},
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
    }

    const handledA: string[] = [];
    const handledB: string[] = [];
    const make = (sink: string[]): Record<string, OutboxHandler> => ({
      [destination]: async (event) => {
        sink.push(event.entityId);
      },
    });

    // Overlapping runs, exactly as two cron invocations could overlap.
    const [a, b] = await Promise.all([
      runDispatchCycle({ store: outbox, handlers: make(handledA), limit: 3 }),
      runDispatchCycle({ store: outbox, handlers: make(handledB), limit: 3 }),
    ]);

    expect(a.claimed).toBeLessThanOrEqual(3);
    expect(b.claimed).toBeLessThanOrEqual(3);

    // The property that matters: no entity handled by both workers.
    const overlap = handledA.filter((id) => handledB.includes(id));
    expect(overlap).toEqual([]);

    const ids: readonly string[] = entityIds;
    const rows = (await outbox.list()).filter((e) => ids.includes(e.entityId));
    // Nothing was delivered twice: every row that was handled is DELIVERED
    // exactly once, and anything not claimed this pass is still PENDING.
    const delivered = rows.filter((r) => r.status === 'DELIVERED');
    expect(delivered.length).toBe(handledA.length + handledB.length);

    for (const row of rows) {
      await client.from('outbox_events').delete().eq('id', row.id);
    }
  });
});
