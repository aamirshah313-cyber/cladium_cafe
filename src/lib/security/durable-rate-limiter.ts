/**
 * The production `RateLimiter`: durable, shared across function instances,
 * and resolved lazily.
 *
 * ## Why lazily
 *
 * Every limiter here is held in a module-scope constant that route modules
 * import. Constructing the Supabase client at import time would make
 * `next build` — which evaluates route modules with no credentials — throw,
 * the exact failure `modules/concierge/deps.ts` already hit and documents.
 * So nothing touches storage until the first `consume`, which only happens
 * inside a request.
 *
 * ## Why it fails closed on construction
 *
 * Same rule as takeaway (`lib/db/durable-storage-policy.ts`): a missing or
 * broken credential throws unless the environment has explicitly opted in to
 * in-memory stores. A silent fallback would be worse here than almost
 * anywhere — the site would look healthy while every rate limit, including
 * staff sign-in, quietly became per-instance again.
 *
 * Tests and Playwright set `ALLOW_IN_MEMORY_STORES=true`; they get the
 * in-memory limiter, as before.
 */

import { assertServerOnly } from '../server-only';
import { createLogger } from '../logging';
import { resolveDurableDeps } from '../db/durable-storage-policy';
import { createPostgresRateLimitStore } from '../db/postgres-rate-limit-store';
import { createSupabaseAdminClient } from '../../modules/integrations/supabase-admin-client';
import { createInMemoryRateLimiter, createRateLimiter } from './rate-limit';
import type { RateLimiter } from './rate-limit';

assertServerOnly('src/lib/security/durable-rate-limiter.ts');

/**
 * `namespace` isolates this limiter's keys in the shared table. Use one per
 * limiter instance, and never reuse a namespace for a different purpose —
 * doing so would merge two limiters' counters.
 */
export function createDurableRateLimiter(namespace: string): RateLimiter {
  let resolved: RateLimiter | null = null;

  function resolve(): RateLimiter {
    if (resolved) return resolved;
    resolved = resolveDurableDeps(
      `Rate limiting (${namespace})`,
      () =>
        createRateLimiter(
          createPostgresRateLimitStore({ client: createSupabaseAdminClient(), namespace }),
        ),
      createInMemoryRateLimiter,
      (error) => {
        createLogger().warn('rate_limit.in_memory_opt_in', {
          namespace,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        });
      },
    );
    return resolved;
  }

  return {
    /*
     * `async` is load-bearing, not style. `resolve()` throws synchronously
     * when durable storage is unavailable, and without `async` that throw
     * escapes `consume` directly instead of becoming a rejected promise —
     * breaking `RateLimiter`'s contract for any caller that chains
     * `.catch()` rather than awaiting inside a try. Every current route
     * happens to await inside an async handler, which is exactly why this
     * would otherwise have gone unnoticed.
     */
    async consume(key, rule, now) {
      return resolve().consume(key, rule, now);
    },
  };
}
