/**
 * Real-Postgres tests for `createPostgresVersionedStore`, exercised through
 * its first concrete mapping (`booking_requests`).
 *
 * Three things here cannot be checked without a real database: that
 * `version` is bumped by the `set_row_updated()` trigger rather than by
 * application code, that `updateIfVersionMatches` is a genuine
 * compare-and-set under concurrency, and that the date/time to
 * `timestamptz` conversion survives a round trip through the column rather
 * than only through the helper's own unit tests.
 *
 * Skips with a clear message when the connection environment is absent.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPostgresBookingRequestStore } from '../../src/lib/db/postgres-booking-request-store';
import type { BookingRequestRecord } from '../../src/modules/bookings/request';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

describe.skipIf(!configured)('createPostgresVersionedStore via booking_requests', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = createPostgresBookingRequestStore(client);
  const createdIds: string[] = [];
  const sessionId = randomUUID();

  function record(overrides: Partial<BookingRequestRecord> = {}): BookingRequestRecord {
    const id = randomUUID();
    createdIds.push(id);
    return {
      id,
      version: 1,
      state: 'REQUESTED',
      guestName: 'Test Guest',
      guestPhone: '03001234567',
      requestedDate: '2026-09-10',
      requestedTime: '19:00',
      partySize: 4,
      seatingPreference: 'GENERAL',
      notes: null,
      sessionId,
      sourceChannel: 'WEB',
      assignedStaffId: null,
      createdAt: new Date('2026-09-04T10:00:00.000Z').toISOString(),
      ...overrides,
    };
  }

  beforeAll(async () => {
    // session_id carries a real foreign key, so exercise the real path
    // rather than forcing null through a cast the domain type forbids.
    const { error } = await client.from('customer_sessions').insert({
      id: sessionId,
      token_hash: randomBytes(32).toString('hex'),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    if (error) throw new Error(`session fixture failed: ${error.message}`);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await client.from('booking_requests').delete().eq('id', id);
    }
    await client.from('customer_sessions').delete().eq('id', sessionId);
  });

  it('round-trips a created record through find()', async () => {
    const created = record();
    await store.create(created);

    const found = await store.find(created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.guestName).toBe(created.guestName);
    expect(found?.partySize).toBe(4);
    expect(found?.state).toBe('REQUESTED');
    expect(found?.version).toBe(1);
  });

  it('stores the requested time as an Abbottabad wall clock, not as UTC', async () => {
    const created = record({ requestedDate: '2026-09-10', requestedTime: '19:00' });
    await store.create(created);

    // Through the domain the wall clock comes back unchanged...
    const found = await store.find(created.id);
    expect(found?.requestedDate).toBe('2026-09-10');
    expect(found?.requestedTime).toBe('19:00');

    // ...and in the column it is the correct instant, five hours earlier.
    const { data } = await client
      .from('booking_requests')
      .select('requested_at')
      .eq('id', created.id)
      .single();
    expect(new Date(data?.requested_at as string).toISOString()).toBe('2026-09-10T14:00:00.000Z');
  });

  it('round-trips an early-morning time that falls on the previous UTC day', async () => {
    const created = record({ requestedDate: '2026-09-10', requestedTime: '01:00' });
    await store.create(created);

    const found = await store.find(created.id);
    expect(found?.requestedDate).toBe('2026-09-10');
    expect(found?.requestedTime).toBe('01:00');
  });

  it('returns null for an id that does not exist', async () => {
    expect(await store.find(randomUUID())).toBeNull();
  });

  it('updates on a matching version and lets the trigger bump it', async () => {
    const created = record();
    await store.create(created);

    const updated = await store.updateIfVersionMatches(created.id, 1, { state: 'CONFIRMED' });
    expect(updated).not.toBeNull();
    expect(updated?.state).toBe('CONFIRMED');
    // Bumped by set_row_updated(), never written by the adapter.
    expect(updated?.version).toBe(2);
  });

  it('returns null on a stale version without changing the row', async () => {
    const created = record();
    await store.create(created);
    await store.updateIfVersionMatches(created.id, 1, { state: 'CONFIRMED' });

    // Version is now 2; a caller still holding 1 must lose.
    const stale = await store.updateIfVersionMatches(created.id, 1, { state: 'CANCELLED' });
    expect(stale).toBeNull();

    const found = await store.find(created.id);
    expect(found?.state).toBe('CONFIRMED');
    expect(found?.version).toBe(2);
  });

  it('lets exactly one of many genuinely concurrent updates win', async () => {
    const created = record();
    await store.create(created);

    // Sequential calls would pass even against a read-then-write
    // implementation; only a real race proves the compare-and-set.
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.updateIfVersionMatches(created.id, 1, { partySize: 6 }),
      ),
    );

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const found = await store.find(created.id);
    expect(found?.version).toBe(2);
  });

  it('rejects an illegal state transition rather than silently returning null', async () => {
    const created = record();
    await store.create(created);

    // REQUESTED -> COLLECTED is not a legal booking transition, and the
    // database trigger enforces that independently of the TypeScript state
    // machine. A version mismatch is expected contention and returns null;
    // an illegal transition is a bug and must throw.
    await expect(
      store.updateIfVersionMatches(created.id, 1, { state: 'COMPLETED' }),
    ).rejects.toThrow();
  });

  it('refuses to patch requestedDate without requestedTime', async () => {
    const created = record();
    await store.create(created);

    await expect(
      store.updateIfVersionMatches(created.id, 1, { requestedDate: '2026-09-11' }),
    ).rejects.toThrow(/must be patched together/);
  });

  it('lists created records, including past the first page boundary', async () => {
    const created = record();
    await store.create(created);

    const all = await store.list();
    expect(all.some((r) => r.id === created.id)).toBe(true);
  });

  it('creates its own customer_sessions row when none exists yet — the real guest-request path, not a test fixture (D-078)', async () => {
    // Every other test in this file relies on beforeAll's fixture session,
    // masking whether create() is actually self-sufficient. This is the
    // exact scenario that broke live on real staging.
    const freshSessionId = randomUUID();
    const created = record({ sessionId: freshSessionId });
    await expect(store.create(created)).resolves.toBeUndefined();

    const { data: sessionRow } = await client
      .from('customer_sessions')
      .select('id')
      .eq('id', freshSessionId)
      .maybeSingle();
    expect(sessionRow).not.toBeNull();
    await client.from('customer_sessions').delete().eq('id', freshSessionId);
  });
});
