/**
 * Real-Postgres tests for `createPostgresAppendOnlySink`, exercised through
 * both concrete mappings (`status_events`, `audit_events`).
 *
 * These tables carry a `forbid_row_change()` trigger that rejects every
 * UPDATE and DELETE — for `service_role` too, since a trigger is not
 * role-scoped. Two consequences shape this file:
 *
 * 1. **Nothing is cleaned up.** These tests cannot delete what they write,
 *    so rows accumulate in the local database. That is correct behaviour
 *    being demonstrated, not a leak, and it is safe because this only ever
 *    runs against a throwaway local stack (`npm run db:reset` resets it).
 * 2. **No test may assume an empty table.** Each one tags its rows with a
 *    unique correlation id and finds only its own, so a growing table and
 *    repeated runs cannot make an assertion pass or fail by accident.
 *
 * The append-only guarantee itself is asserted rather than assumed.
 */

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createPostgresAuditEventSink,
  createPostgresStatusEventSink,
} from '../../src/lib/db/postgres-event-sinks';
import type { StatusEvent } from '../../src/lib/domain/status-event';
import type { AuditEvent } from '../../src/lib/domain/audit-event';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

describe.skipIf(!configured)('createPostgresAppendOnlySink via event tables', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const statusSink = createPostgresStatusEventSink(client);
  const auditSink = createPostgresAuditEventSink(client);

  function statusEvent(overrides: Partial<StatusEvent> = {}): StatusEvent {
    return {
      entityType: 'BOOKING_REQUEST',
      entityId: randomUUID(),
      previousState: 'REQUESTED',
      newState: 'CONFIRMED',
      actorType: 'STAFF',
      actorId: randomUUID(),
      reasonCode: 'STAFF_CONFIRMED',
      reasonNote: 'Table available',
      requestVersion: 2,
      correlationId: randomUUID(),
      occurredAt: new Date('2026-09-04T10:00:00.000Z').toISOString(),
      ...overrides,
    };
  }

  function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
    return {
      category: 'ADMIN',
      action: 'menu_version.published',
      actorType: 'STAFF',
      actorId: randomUUID(),
      targetType: 'MENU_VERSION',
      targetId: randomUUID(),
      safeDetail: { versionNumber: 3 },
      correlationId: randomUUID(),
      occurredAt: new Date('2026-09-04T10:00:00.000Z').toISOString(),
      ...overrides,
    };
  }

  describe('status_events', () => {
    it('appends an event and reads back every mapped field', async () => {
      const event = statusEvent();
      await statusSink.append(event);

      const found = (await statusSink.list()).find((e) => e.correlationId === event.correlationId);
      expect(found).toEqual(event);
    });

    it('appends an event with no previous state, as a creation records', async () => {
      const event = statusEvent({ previousState: null, newState: 'REQUESTED' });
      await statusSink.append(event);

      const found = (await statusSink.list()).find((e) => e.correlationId === event.correlationId);
      expect(found?.previousState).toBeNull();
    });

    it('appends a guest-actor event with no actor id', async () => {
      // The schema's status_events_staff_attributed constraint only requires
      // an actor id for STAFF, so a GUEST event legitimately has none.
      const event = statusEvent({ actorType: 'GUEST', actorId: null, reasonCode: null });
      await statusSink.append(event);

      const found = (await statusSink.list()).find((e) => e.correlationId === event.correlationId);
      expect(found?.actorId).toBeNull();
    });

    it('rejects a staff event with no actor id, as the schema requires', async () => {
      await expect(
        statusSink.append(statusEvent({ actorType: 'STAFF', actorId: null })),
      ).rejects.toThrow();
    });

    it('rejects a reason code that is not SCREAMING_SNAKE_CASE', async () => {
      await expect(
        statusSink.append(statusEvent({ reasonCode: 'not upper case' })),
      ).rejects.toThrow();
    });

    it('keeps appended events, never replacing them', async () => {
      const shared = randomUUID();
      await statusSink.append(statusEvent({ correlationId: shared, newState: 'CONFIRMED' }));
      await statusSink.append(statusEvent({ correlationId: shared, newState: 'SEATED' }));

      const mine = (await statusSink.list()).filter((e) => e.correlationId === shared);
      expect(mine).toHaveLength(2);
      expect(mine.map((e) => e.newState).sort()).toEqual(['CONFIRMED', 'SEATED']);
    });

    it('is append-only in the database: update and delete are both refused', async () => {
      const event = statusEvent();
      await statusSink.append(event);

      const update = await client
        .from('status_events')
        .update({ new_state: 'CANCELLED' })
        .eq('correlation_id', event.correlationId);
      expect(update.error).not.toBeNull();

      const remove = await client
        .from('status_events')
        .delete()
        .eq('correlation_id', event.correlationId);
      expect(remove.error).not.toBeNull();
    });
  });

  describe('audit_events', () => {
    it('appends an event and reads back every mapped field, renames included', async () => {
      const event = auditEvent();
      await auditSink.append(event);

      const found = (await auditSink.list()).find((e) => e.correlationId === event.correlationId);
      // targetType/targetId are the columns entity_type/entity_id — the pair
      // most likely to be mapped backwards without noticing.
      expect(found).toEqual(event);
    });

    it('persists the category the schema had no column for until this work', async () => {
      const event = auditEvent({ category: 'PII_ACCESS', action: 'guest.contact_viewed' });
      await auditSink.append(event);

      const { data } = await client
        .from('audit_events')
        .select('category')
        .eq('correlation_id', event.correlationId)
        .single();
      expect(data?.category).toBe('PII_ACCESS');
    });

    it('round-trips a null safeDetail through the NOT NULL metadata column', async () => {
      const event = auditEvent({ safeDetail: null });
      await auditSink.append(event);

      const found = (await auditSink.list()).find((e) => e.correlationId === event.correlationId);
      expect(found?.safeDetail).toBeNull();
    });

    it('rejects an action that breaks the schema format', async () => {
      await expect(auditSink.append(auditEvent({ action: 'Not Valid Action' }))).rejects.toThrow();
    });

    it('is append-only in the database: update and delete are both refused', async () => {
      const event = auditEvent();
      await auditSink.append(event);

      const update = await client
        .from('audit_events')
        .update({ action: 'tampered.action' })
        .eq('correlation_id', event.correlationId);
      expect(update.error).not.toBeNull();

      const remove = await client
        .from('audit_events')
        .delete()
        .eq('correlation_id', event.correlationId);
      expect(remove.error).not.toBeNull();
    });
  });
});
