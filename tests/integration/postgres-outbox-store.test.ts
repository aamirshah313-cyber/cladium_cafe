/**
 * Real-Postgres tests for `createPostgresOutboxStore`.
 *
 * The riskiest adapter of the set: several dispatcher workers may run at
 * once, and the failure modes are delivering an event twice or stranding
 * it forever. Neither shows up in a sequential test, so the two that
 * matter are exercised as real races — two workers claiming the same
 * backlog concurrently, and two workers resolving the same claim.
 *
 * Every test scopes itself to its own `destination`, so a shared table and
 * repeated runs cannot make an assertion pass by accident.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresOutboxStore } from '../../src/lib/db/postgres-outbox-store';
import { buildOutboxEvent } from '../../src/lib/domain/outbox';
import type { OutboxEvent } from '../../src/lib/domain/outbox';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

describe.skipIf(!configured)('createPostgresOutboxStore (real Postgres)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = createPostgresOutboxStore(client);
  const destinations: string[] = [];

  function destination(): string {
    const d = `test.${randomUUID()}`;
    destinations.push(d);
    return d;
  }

  function event(dest: string, overrides: Partial<OutboxEvent> = {}): OutboxEvent {
    return {
      ...buildOutboxEvent({
        eventType: 'booking_request.confirmed',
        entityType: 'BOOKING_REQUEST',
        entityId: randomUUID(),
        payload: { requestId: randomUUID() },
        destination: dest,
        generateId: randomUUID,
        now: () => new Date('2026-09-04T10:00:00.000Z'),
      }),
      ...overrides,
    };
  }

  /** Reads rows for one destination directly, bypassing the adapter. */
  async function rowsFor(dest: string) {
    const { data } = await client
      .from('outbox_events')
      .select('id, status, attempt_count, version, claimed_at, next_attempt_at, last_error')
      .eq('destination', dest);
    return data ?? [];
  }

  afterAll(async () => {
    for (const d of destinations) {
      await client.from('outbox_events').delete().eq('destination', d);
    }
  });

  it('appends an event and reads back every mapped field', async () => {
    const dest = destination();
    const e = event(dest);
    await store.append(e);

    const found = (await store.list()).find((row) => row.id === e.id);
    expect(found).toEqual(e);
  });

  it('claims a due PENDING event and marks it CLAIMED', async () => {
    const dest = destination();
    const e = event(dest);
    await store.append(e);

    const claimed = await store.claimBatch({
      limit: 10,
      now: new Date('2026-09-04T10:00:01.000Z'),
      staleClaimMs: 60_000,
    });

    const mine = claimed.filter((c) => c.destination === dest);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.status).toBe('CLAIMED');
    expect(mine[0]?.claimedAt).not.toBeNull();
    // Bumped by outbox_events_set_updated, never written by the adapter.
    expect(mine[0]?.version).toBe(2);
  });

  it('does not claim an event whose next attempt is still in the future', async () => {
    const dest = destination();
    await store.append(
      event(dest, { nextAttemptAt: new Date('2026-09-04T12:00:00.000Z').toISOString() }),
    );

    const claimed = await store.claimBatch({
      limit: 10,
      now: new Date('2026-09-04T10:00:01.000Z'),
      staleClaimMs: 60_000,
    });
    expect(claimed.filter((c) => c.destination === dest)).toHaveLength(0);
  });

  it('respects the batch limit and takes the oldest work first', async () => {
    const dest = destination();
    // The only test here needing an empty table. `claimBatch` is global by
    // design — a dispatcher claims across every destination — so a limit of
    // 2 takes the two oldest rows in the whole table, which would otherwise
    // be rows left behind by the tests above rather than this test's own.
    // Safe to clear: outbox_events carries no append-only trigger, and this
    // only ever runs against a throwaway local stack.
    await client.from('outbox_events').delete().neq('id', randomUUID());

    const times = ['10:00:00', '10:00:01', '10:00:02'];
    for (const t of times) {
      await store.append(
        event(dest, { nextAttemptAt: new Date(`2026-09-04T${t}.000Z`).toISOString() }),
      );
    }

    const claimed = await store.claimBatch({
      limit: 2,
      now: new Date('2026-09-04T11:00:00.000Z'),
      staleClaimMs: 60_000,
    });

    const mine = claimed.filter((c) => c.destination === dest);
    expect(mine).toHaveLength(2);
    expect(mine.map((c) => c.nextAttemptAt).sort()).toEqual([
      '2026-09-04T10:00:00.000Z',
      '2026-09-04T10:00:01.000Z',
    ]);
  });

  it('reclaims a claim left stale by a worker that died mid-flight', async () => {
    const dest = destination();
    await store.append(event(dest));

    const first = new Date('2026-09-04T10:00:01.000Z');
    await store.claimBatch({ limit: 10, now: first, staleClaimMs: 60_000 });

    // Still inside the stale window: nobody may take it.
    const tooSoon = await store.claimBatch({
      limit: 10,
      now: new Date(first.getTime() + 30_000),
      staleClaimMs: 60_000,
    });
    expect(tooSoon.filter((c) => c.destination === dest)).toHaveLength(0);

    // Past it: another worker reclaims, rather than the row being stranded.
    const reclaimed = await store.claimBatch({
      limit: 10,
      now: new Date(first.getTime() + 120_000),
      staleClaimMs: 60_000,
    });
    expect(reclaimed.filter((c) => c.destination === dest)).toHaveLength(1);
  });

  it('never hands the same event to two workers claiming concurrently', async () => {
    const dest = destination();
    for (let i = 0; i < 8; i += 1) await store.append(event(dest));

    const now = new Date('2026-09-04T10:00:01.000Z');
    // The real scenario: two dispatchers on the same backlog at once. Without
    // FOR UPDATE SKIP LOCKED this is where an event gets delivered twice.
    const [a, b] = await Promise.all([
      store.claimBatch({ limit: 8, now, staleClaimMs: 60_000 }),
      store.claimBatch({ limit: 8, now, staleClaimMs: 60_000 }),
    ]);

    const mineA = a.filter((c) => c.destination === dest).map((c) => c.id);
    const mineB = b.filter((c) => c.destination === dest).map((c) => c.id);
    expect(mineA.filter((id) => mineB.includes(id))).toEqual([]);
    expect(new Set([...mineA, ...mineB]).size).toBe(mineA.length + mineB.length);
  });

  it('marks a claim delivered on a matching version', async () => {
    const dest = destination();
    const e = event(dest);
    await store.append(e);
    const [claimed] = await store.claimBatch({
      limit: 1,
      now: new Date('2026-09-04T10:00:01.000Z'),
      staleClaimMs: 60_000,
    });

    const ok = await store.markDelivered(e.id, claimed?.version ?? 0, new Date());
    expect(ok).toBe(true);

    const [row] = await rowsFor(dest);
    expect(row?.status).toBe('DELIVERED');
  });

  it('refuses to resolve a claim on a stale version', async () => {
    const dest = destination();
    const e = event(dest);
    await store.append(e);
    await store.claimBatch({
      limit: 1,
      now: new Date('2026-09-04T10:00:01.000Z'),
      staleClaimMs: 60_000,
    });

    // Version is 2 after the claim; a worker still holding 1 must lose.
    expect(await store.markDelivered(e.id, 1, new Date())).toBe(false);
  });

  it('lets exactly one of two workers resolve the same claim', async () => {
    const dest = destination();
    const e = event(dest);
    await store.append(e);
    const [claimed] = await store.claimBatch({
      limit: 1,
      now: new Date('2026-09-04T10:00:01.000Z'),
      staleClaimMs: 60_000,
    });
    const version = claimed?.version ?? 0;

    const results = await Promise.all([
      store.markDelivered(e.id, version, new Date()),
      store.markDelivered(e.id, version, new Date()),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('returns a retried event to PENDING with the attempt count incremented', async () => {
    const dest = destination();
    const e = event(dest);
    await store.append(e);
    const [claimed] = await store.claimBatch({
      limit: 1,
      now: new Date('2026-09-04T10:00:01.000Z'),
      staleClaimMs: 60_000,
    });

    const ok = await store.markRetry(
      e.id,
      claimed?.version ?? 0,
      { nextAttemptAt: new Date('2026-09-04T10:05:00.000Z'), lastError: 'timeout' },
      new Date(),
    );
    expect(ok).toBe(true);

    const [row] = await rowsFor(dest);
    expect(row?.status).toBe('PENDING');
    // Incremented in SQL: a read-then-write would lose this under a race.
    expect(row?.attempt_count).toBe(1);
    expect(row?.claimed_at).toBeNull();
    expect(row?.last_error).toBe('timeout');
  });

  it('marks an event permanently failed, satisfying the failed_at constraint', async () => {
    const dest = destination();
    const e = event(dest);
    await store.append(e);
    const [claimed] = await store.claimBatch({
      limit: 1,
      now: new Date('2026-09-04T10:00:01.000Z'),
      staleClaimMs: 60_000,
    });

    const ok = await store.markTerminal(
      e.id,
      claimed?.version ?? 0,
      { lastError: 'permanent' },
      new Date(),
    );
    expect(ok).toBe(true);

    const [row] = await rowsFor(dest);
    expect(row?.status).toBe('FAILED');
    expect(row?.attempt_count).toBe(1);
  });

  it('does not claim events that are already resolved', async () => {
    const dest = destination();
    const e = event(dest);
    await store.append(e);
    const [claimed] = await store.claimBatch({
      limit: 1,
      now: new Date('2026-09-04T10:00:01.000Z'),
      staleClaimMs: 60_000,
    });
    await store.markDelivered(e.id, claimed?.version ?? 0, new Date());

    const again = await store.claimBatch({
      limit: 10,
      now: new Date('2026-09-04T12:00:00.000Z'),
      staleClaimMs: 1,
    });
    expect(again.filter((c) => c.destination === dest)).toHaveLength(0);
  });
});
