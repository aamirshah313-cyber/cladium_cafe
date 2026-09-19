/**
 * `lib/security/durable-rate-limiter.ts` — the wiring, not the store.
 *
 * The store's behaviour against real Postgres is proven in
 * `tests/integration/postgres-rate-limit-store.test.ts`. What is proven here
 * is the two properties a wrong wiring would break silently:
 *
 * 1. **Nothing touches storage at construction.** The limiters are
 *    module-scope constants imported by route modules, and `next build`
 *    evaluates those with no credentials. An eager client would fail the
 *    build — the failure `modules/concierge/deps.ts` already documents.
 * 2. **A missing credential fails closed.** Without the explicit opt-in, a
 *    broken environment must throw rather than quietly fall back to a
 *    per-instance `Map`, which would look healthy while every limit —
 *    staff sign-in included — stopped holding across instances.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DurableStorageUnavailableError } from '../../src/lib/db/durable-storage-policy';
import { createDurableRateLimiter } from '../../src/lib/security/durable-rate-limiter';

const RULE = { windowMs: 60_000, max: 2 };

function withoutCredentials(): void {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

describe('createDurableRateLimiter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('constructs without credentials and without the opt-in — storage is not touched until consume', () => {
    withoutCredentials();
    vi.stubEnv('ALLOW_IN_MEMORY_STORES', '');
    expect(() => createDurableRateLimiter('construct-only')).not.toThrow();
  });

  it('fails closed on first consume when credentials are missing and in-memory is not opted in', async () => {
    withoutCredentials();
    vi.stubEnv('ALLOW_IN_MEMORY_STORES', '');
    const limiter = createDurableRateLimiter('fail-closed');

    await expect(limiter.consume('k', RULE)).rejects.toBeInstanceOf(DurableStorageUnavailableError);
  });

  it('uses the in-memory limiter only when the environment explicitly opts in', async () => {
    withoutCredentials();
    vi.stubEnv('ALLOW_IN_MEMORY_STORES', 'true');
    const limiter = createDurableRateLimiter('opted-in');
    const now = new Date('2026-01-01T00:00:00.000Z');

    const first = await limiter.consume('k', RULE, now);
    const second = await limiter.consume('k', RULE, now);
    const third = await limiter.consume('k', RULE, now);

    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);
  });

  it('resolves once and reuses it, so counts accumulate across calls', async () => {
    withoutCredentials();
    vi.stubEnv('ALLOW_IN_MEMORY_STORES', 'true');
    const limiter = createDurableRateLimiter('resolve-once');
    const now = new Date('2026-01-01T00:00:00.000Z');

    await limiter.consume('k', RULE, now);
    // If each consume re-resolved, every call would get a fresh in-memory
    // store and `remaining` would never drop.
    const second = await limiter.consume('k', RULE, now);
    expect(second.remaining).toBe(0);
  });
});
