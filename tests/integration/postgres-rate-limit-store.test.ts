/**
 * Real-Postgres tests for `createPostgresRateLimitStore`.
 *
 * The in-memory limiter was replaced because it could not hold a limit
 * across serverless instances, so the first thing proven here is that two
 * *separately constructed* stores share one counter. The second is the
 * adapter contract's own requirement: increment-and-read must be atomic, so
 * a genuinely concurrent burst on one key admits exactly `max` and no more.
 *
 * Skips with a clear message when the connection environment is absent, so
 * a run without a database reports "skipped", never a false pass.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createPostgresRateLimitStore,
  hashRateLimitKey,
} from '../../src/lib/db/postgres-rate-limit-store';
import { createRateLimiter } from '../../src/lib/security/rate-limit';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const configured = Boolean(url && serviceRoleKey);

describe.skipIf(!configured)('createPostgresRateLimitStore (real Postgres)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Every test uses its own namespace, so tests cannot see each other's rows
  // and the cleanup below removes exactly what this file created.
  const namespaces: string[] = [];
  const ns = () => {
    const n = `test-${randomUUID()}`;
    namespaces.push(n);
    return n;
  };
  const store = (namespace: string) =>
    createPostgresRateLimitStore({ client, namespace, pruneEvery: 0 });

  const T0 = Date.parse('2026-01-01T00:00:00.000Z');
  const MINUTE = 60_000;

  afterAll(async () => {
    // Keys are only stored hashed, so cleanup has to re-derive the digests.
    const keys = ['k', 'shared-key', 'burst', 'session-a'];
    const hashes = namespaces.flatMap((n) => keys.map((k) => hashRateLimitKey(n, k)));
    await client.from('rate_limit_windows').delete().in('key_hash', hashes);
  });

  it('counts the first hit as 1 and sets the window from the caller clock', async () => {
    const result = await store(ns()).incrementAndGet('k', MINUTE, T0);
    expect(result).toEqual({ count: 1, resetAt: T0 + MINUTE });
  });

  it('increments within a window and keeps the original reset time', async () => {
    const s = store(ns());
    await s.incrementAndGet('k', MINUTE, T0);
    await s.incrementAndGet('k', MINUTE, T0 + 10_000);
    const third = await s.incrementAndGet('k', MINUTE, T0 + 59_999);
    expect(third).toEqual({ count: 3, resetAt: T0 + MINUTE });
  });

  it('starts a new window exactly when resetAt <= now, matching the in-memory adapter', async () => {
    const s = store(ns());
    await s.incrementAndGet('k', MINUTE, T0);
    await s.incrementAndGet('k', MINUTE, T0 + 1);
    const atBoundary = await s.incrementAndGet('k', MINUTE, T0 + MINUTE);
    expect(atBoundary).toEqual({ count: 1, resetAt: T0 + 2 * MINUTE });
  });

  it('shares one counter across separately constructed stores — the reason this exists', async () => {
    // Two stores built independently stand in for two serverless instances.
    // The in-memory adapter would report 1 from each.
    const namespace = ns();
    const instanceA = createPostgresRateLimitStore({ client, namespace, pruneEvery: 0 });
    const instanceB = createPostgresRateLimitStore({ client, namespace, pruneEvery: 0 });
    expect((await instanceA.incrementAndGet('shared-key', MINUTE, T0)).count).toBe(1);
    expect((await instanceB.incrementAndGet('shared-key', MINUTE, T0 + 5)).count).toBe(2);
    expect((await instanceA.incrementAndGet('shared-key', MINUTE, T0 + 9)).count).toBe(3);
  });

  it('admits exactly max under a genuinely concurrent burst on one key', async () => {
    const limiter = createRateLimiter(store(ns()));
    const rule = { windowMs: MINUTE, max: 20 };
    const burst = 60;
    const now = new Date(T0);

    const decisions = await Promise.all(
      Array.from({ length: burst }, () => limiter.consume('burst', rule, now)),
    );

    expect(decisions.filter((d) => d.allowed)).toHaveLength(rule.max);
    // Every caller saw a distinct post-increment count — no two read the same
    // value, which is what a read-then-write race would produce.
    const remaining = decisions.map((d) => d.remaining).filter((r) => r > 0);
    expect(new Set(remaining).size).toBe(remaining.length);
  });

  it('isolates namespaces: the same key under two limiters counts independently', async () => {
    const a = store(ns());
    const b = store(ns());
    await a.incrementAndGet('session-a', MINUTE, T0);
    await a.incrementAndGet('session-a', MINUTE, T0);
    expect((await b.incrementAndGet('session-a', MINUTE, T0)).count).toBe(1);
  });

  it('never stores the raw key, only its namespaced SHA-256 digest', async () => {
    const namespace = ns();
    await store(namespace).incrementAndGet('k', MINUTE, T0);

    const { data: byRaw } = await client
      .from('rate_limit_windows')
      .select('key_hash')
      .eq('key_hash', 'k');
    expect(byRaw).toEqual([]);

    const { data: byHash } = await client
      .from('rate_limit_windows')
      .select('key_hash, hit_count')
      .eq('key_hash', hashRateLimitKey(namespace, 'k'));
    expect(byHash).toEqual([{ key_hash: hashRateLimitKey(namespace, 'k'), hit_count: 1 }]);
  });

  it('prunes expired windows and leaves live ones', async () => {
    const namespace = ns();
    const s = store(namespace);
    await s.incrementAndGet('k', MINUTE, T0); // expires T0 + 1m
    await s.incrementAndGet('session-a', 10 * MINUTE, T0); // expires T0 + 10m

    const { error } = await client.rpc('rate_limit_prune', {
      p_now: new Date(T0 + 2 * MINUTE).toISOString(),
      p_limit: 10_000,
    });
    expect(error).toBeNull();

    const { data } = await client
      .from('rate_limit_windows')
      .select('key_hash')
      .in('key_hash', [hashRateLimitKey(namespace, 'k'), hashRateLimitKey(namespace, 'session-a')]);
    expect(data).toEqual([{ key_hash: hashRateLimitKey(namespace, 'session-a') }]);
  });

  it('rejects an invalid window before touching the database', async () => {
    const s = store(ns());
    await expect(s.incrementAndGet('k', 0, T0)).rejects.toThrow(/positive integer/);
    await expect(s.incrementAndGet('k', 1.5, T0)).rejects.toThrow(/positive integer/);
  });

  it.skipIf(!anonKey)('refuses the anon role, and the error never quotes the key', async () => {
    const anon = createClient(url ?? '', anonKey ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const secretLookingKey = `staff-signin:${randomUUID()}`;
    const s = createPostgresRateLimitStore({ client: anon, namespace: ns(), pruneEvery: 0 });

    const failure = await s.incrementAndGet(secretLookingKey, MINUTE, T0).catch((e: Error) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/^rate limit consume failed: /);
    expect((failure as Error).message).not.toContain(secretLookingKey);
  });
});
