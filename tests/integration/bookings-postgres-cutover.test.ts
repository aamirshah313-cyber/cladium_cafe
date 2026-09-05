/**
 * End-to-end proof for `createPostgresBookingDeps()`
 * (`src/modules/bookings/deps.ts`) — the first test in this project that
 * drives a real domain's actual submission and staff-transition services
 * against real Postgres, rather than testing one adapter in isolation.
 *
 * Every prior integration test (D-064 through D-070) proved one store
 * correct on its own. None of them could prove the thing that actually
 * matters for a cutover: that `prepareBookingRequest` /
 * `submitBookingRequest` / `transitionBookingRequest` — the real,
 * unmodified domain services — produce a consistent set of rows across
 * `confirmation_tokens`, `idempotency_keys`, `booking_requests`,
 * `status_events`, and `audit_events` when run together, with no
 * per-store mocking to hide a wiring mistake (a wrong `operation` string,
 * a wrong `entityType`, a swapped argument) that no single adapter test
 * could catch.
 *
 * `bookingDeps` itself (the live singleton routes actually use) is
 * unaffected — this only proves `createPostgresBookingDeps()` correct in
 * isolation, deliberately short of switching anything live. See that
 * function's own doc comment for why flipping the switch is a separate
 * decision.
 *
 * `newSession()` deliberately does NOT insert a `customer_sessions` row
 * (D-078 follow-up) — it used to, and that is exactly what let this test
 * pass 6/6 while the real application had never once written that row
 * itself, until a real submission against real staging hit the foreign
 * key `confirmation_tokens.session_id` carries. Every adapter with that
 * same FK now ensures the row itself (`ensureCustomerSessionRow`), so this
 * test proves the real gap is closed, not just re-masks it.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresBookingDeps } from '../../src/modules/bookings/deps';
import { ensureCustomerSessionRow } from '../../src/lib/db/postgres-customer-session';
import {
  prepareBookingRequest,
  submitBookingRequest,
} from '../../src/modules/bookings/submission-service';
import { transitionBookingRequest } from '../../src/modules/bookings/staff-service';
import type { Actor } from '../../src/lib/domain/actor';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

const DRAFT = {
  guestName: 'Aamir',
  guestPhone: '+923001234567',
  requestedDate: '2026-09-10',
  requestedTime: '19:30',
  partySize: 4,
  seatingPreference: 'TREEHOUSE' as const,
  notes: null,
};

describe.skipIf(!configured)('createPostgresBookingDeps (real Postgres, end to end)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps = createPostgresBookingDeps(client);
  const createdSessionIds: string[] = [];
  const createdRequestIds: string[] = [];

  /**
   * Deliberately does NOT insert a `customer_sessions` row (D-078 follow-up):
   * this test's whole point is proving the real, unmodified domain services
   * work end-to-end, and the earlier version of this fixture manually
   * inserting that row is exactly what masked the real gap that broke live
   * on staging — `resolveCustomerSession` never writes it itself, only the
   * adapters do now (`ensureCustomerSessionRow`, called from
   * `postgres-confirmation-token-store.ts` and `postgres-versioned-store.ts`'s
   * `getSessionId` hook). A session id here is just a fresh random UUID,
   * exactly what the real cookie-based session layer actually produces.
   */
  function newSession(): string {
    const sessionId = randomUUID();
    createdSessionIds.push(sessionId);
    return sessionId;
  }

  async function prepareAndSubmit(sessionId: string, idempotencyKey: string) {
    const prepared = await prepareBookingRequest(deps, { sessionId, ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed in test setup');
    const result = await submitBookingRequest(deps, {
      sessionId,
      ...DRAFT,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey,
      correlationId: randomUUID(),
    });
    if (result.ok) createdRequestIds.push(result.value.requestId);
    return result;
  }

  afterAll(async () => {
    // booking_requests has no append-only trigger, so cleanup is a real
    // delete. status_events/audit_events rows this test wrote are left in
    // place — they are append-only, same as every other integration test
    // touching those tables (see src/lib/db/README.md).
    for (const id of createdRequestIds) {
      await client.from('booking_requests').delete().eq('id', id);
    }
    for (const id of createdSessionIds) {
      await client.from('customer_sessions').delete().eq('id', id);
    }
  });

  it('creates a real, durable request row with the guest-submitted fields', async () => {
    const sessionId = await newSession();
    const result = await prepareAndSubmit(sessionId, `idem-${randomUUID()}`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const record = await deps.requestStore.find(result.value.requestId);
    expect(record).toMatchObject({ state: 'REQUESTED', version: 1, ...DRAFT, sessionId });
  });

  it('appends a real status event and a real audit event for the submission', async () => {
    const sessionId = await newSession();
    const result = await prepareAndSubmit(sessionId, `idem-${randomUUID()}`);
    if (!result.ok) throw new Error('submission failed in test');

    const statusEvents = (await deps.statusEvents.list()).filter(
      (e) => e.entityId === result.value.requestId,
    );
    expect(statusEvents).toEqual([
      expect.objectContaining({
        entityType: 'BOOKING_REQUEST',
        previousState: null,
        newState: 'REQUESTED',
        actorType: 'GUEST',
      }),
    ]);

    const auditEvents = (await deps.auditEvents.list()).filter(
      (e) => e.targetId === result.value.requestId,
    );
    expect(auditEvents).toEqual([
      expect.objectContaining({
        action: 'booking_request.submitted',
        targetType: 'BOOKING_REQUEST',
      }),
    ]);
  });

  it('appends the notification to the shared in-memory outbox, proving that seam still works unchanged', async () => {
    const sessionId = await newSession();
    const result = await prepareAndSubmit(sessionId, `idem-${randomUUID()}`);
    if (!result.ok) throw new Error('submission failed in test');

    // outbox is deliberately still in-memory (see createPostgresBookingDeps'
    // doc comment) — this proves the durable stores and the one remaining
    // in-memory store still cooperate correctly as a single call sequence.
    const outboxEvents = (await deps.outbox.list()).filter(
      (e) => e.entityId === result.value.requestId,
    );
    expect(outboxEvents).toEqual([
      expect.objectContaining({
        eventType: 'booking_request.requested',
        destination: 'staff_notification',
        status: 'PENDING',
      }),
    ]);
  });

  it('replays the same result on a genuine idempotent retry, creating only one request', async () => {
    // A real retry resends the exact same confirmationToken + idempotencyKey
    // it used before (the client never re-prepares) — the fingerprint IS
    // the raw token, so reusing it is what makes this a genuine replay
    // rather than a fresh submission that happens to share a key.
    const sessionId = await newSession();
    const prepared = await prepareBookingRequest(deps, { sessionId, ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');
    const input = {
      sessionId,
      ...DRAFT,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: `idem-${randomUUID()}`,
      correlationId: randomUUID(),
    };

    const first = await submitBookingRequest(deps, input);
    if (first.ok) createdRequestIds.push(first.value.requestId);
    // Replays before consumeConfirmationToken ever runs a second time — a
    // real second consumption attempt would fail closed (already used), so
    // an identical result here can only mean runIdempotent's own replay
    // path, backed by real Postgres, produced it.
    const second = await submitBookingRequest(deps, input);

    expect(second).toEqual(first);

    const all = (await deps.requestStore.list()).filter((r) => r.sessionId === sessionId);
    expect(all).toHaveLength(1);
  });

  it('marks the idempotency record FAILED rather than stuck IN_PROGRESS when the operation genuinely fails', async () => {
    // Proves the runIdempotent fix (this session's fix for fn() throwing)
    // holds against the real Postgres store, not just the fake one its own
    // unit test used. A session-less sessionId fails too early (at
    // issueConfirmationToken, before runIdempotent's fn even starts) to
    // exercise this, since confirmation_tokens.session_id has the same real
    // foreign key. Instead: pre-insert a real booking_requests row under a
    // known id, then force deps.generateId to hand that same id back, so
    // requestStore.create() collides on the primary key and throws from
    // inside fn — the exact class of failure the fix targets.
    const sessionId = await newSession();
    // This specific test needs a raw booking_requests insert (to force a
    // primary-key collision), bypassing requestStore.create() entirely --
    // so unlike every other test here, it must ensure the session row
    // itself, the same way the real adapter now does.
    await ensureCustomerSessionRow(client, sessionId);
    const collidingId = randomUUID();
    createdRequestIds.push(collidingId);
    const { error: seedError } = await client.from('booking_requests').insert({
      id: collidingId,
      session_id: sessionId,
      guest_name: DRAFT.guestName,
      guest_phone: DRAFT.guestPhone,
      requested_at: new Date('2026-09-10T14:30:00.000Z').toISOString(),
      party_size: DRAFT.partySize,
      seating_preference: DRAFT.seatingPreference,
    });
    if (seedError) throw new Error(`colliding-row fixture failed: ${seedError.message}`);

    const idempotencyKey = `idem-${randomUUID()}`;
    const prepared = await prepareBookingRequest(deps, { sessionId, ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');
    const collidingDeps = { ...deps, generateId: () => collidingId };

    await expect(
      submitBookingRequest(collidingDeps, {
        sessionId,
        ...DRAFT,
        sourceChannel: 'WEB',
        confirmationToken: prepared.value.confirmationToken,
        idempotencyKey,
        correlationId: randomUUID(),
      }),
    ).rejects.toThrow();

    const { data } = await client
      .from('idempotency_keys')
      .select('status')
      .eq('actor_key', `${sessionId}:submitBookingRequest`)
      .eq('idempotency_key', idempotencyKey)
      .single();
    expect(data?.status).toBe('FAILED');
  });

  it('transitions a real request through the staff service, bumping version and appending history', async () => {
    const sessionId = await newSession();
    const submitted = await prepareAndSubmit(sessionId, `idem-${randomUUID()}`);
    if (!submitted.ok) throw new Error('submission failed');

    const staffActor: Actor = { type: 'STAFF', id: randomUUID(), roles: ['MANAGER'] };
    const transitioned = await transitionBookingRequest(deps, staffActor, {
      entityId: submitted.value.requestId,
      expectedVersion: 1,
      newState: 'CONFIRMED',
      correlationId: randomUUID(),
    });

    expect(transitioned.ok).toBe(true);
    if (!transitioned.ok) return;
    expect(transitioned.value.state).toBe('CONFIRMED');
    expect(transitioned.value.version).toBe(2);

    const events = (await deps.statusEvents.list()).filter(
      (e) => e.entityId === submitted.value.requestId,
    );
    expect(events.map((e) => e.newState).sort()).toEqual(['CONFIRMED', 'REQUESTED']);
  });
});
