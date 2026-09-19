/**
 * Postgres-backed `RateLimitStoreAdapter` — the shared store the in-memory
 * limiter's own doc comment always said production needed.
 *
 * ## Why the in-memory limiter was not a limit in production
 *
 * On Vercel each function instance holds its own `Map`. A cold start begins
 * at zero, and a burst spread over N warm instances is allowed about N times
 * the configured maximum. `lib/http/route-rate-limits.ts` had the right
 * rules; nothing underneath could enforce them across instances. That
 * included the staff sign-in rule, the one credential-guessing surface.
 *
 * ## What this adapter guarantees, and how
 *
 * - **Atomic increment-and-read.** `rate_limit_consume` is a single
 *   `insert ... on conflict do update ... returning`; concurrent callers on
 *   one key serialise on the row lock and each gets its own count. Proven
 *   with genuinely concurrent calls in
 *   `tests/integration/postgres-rate-limit-store.test.ts`.
 * - **Keys never reach storage.** Callers key by session id or, for staff
 *   sign-in, by the *attempted* staff id. Only a SHA-256 digest is stored;
 *   the column rejects anything else. The digest is of
 *   `namespace + NUL + key`, so two limiters sharing the table can never
 *   collide even if their callers pick overlapping key formats.
 * - **Identical semantics to the in-memory adapter.** Window arithmetic uses
 *   the caller's `nowMs`, a window resets when `resetAt <= now`, and the
 *   first hit in a window counts as 1. `RateLimiter` callers cannot tell
 *   which store they have, which is the point of the interface.
 *
 * ## Errors throw rather than allow
 *
 * A store failure propagates to the route as a 500. Failing *open* would
 * turn a database outage into an unthrottled window on exactly the routes
 * that write to that database, and on staff sign-in. Failing closed costs
 * nothing extra: every guarded route needs the same database a moment later
 * anyway. Messages carry the Postgres error code only — never the key.
 *
 * ## Housekeeping is opportunistic
 *
 * One row per distinct key is reused across windows, so growth tracks
 * distinct visitors, not requests. Roughly one call in `pruneEvery` also
 * deletes a bounded batch of expired rows. It is not awaited and its
 * failure is swallowed: a serverless instance may be frozen before it
 * finishes, and that is fine for housekeeping that the next sampled call
 * will simply repeat. It must never slow or fail a guest's request.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { assertServerOnly } from '../server-only';
import type { RateLimitStoreAdapter } from '../security/rate-limit';

assertServerOnly('src/lib/db/postgres-rate-limit-store.ts');

/** Postgres `integer` upper bound — `p_window_ms` is declared `integer`. */
const MAX_WINDOW_MS = 2_147_483_647;

export interface PostgresRateLimitStoreOptions {
  readonly client: SupabaseClient;
  /**
   * Isolates this limiter's keys from every other limiter sharing the table.
   * Required rather than defaulted, so a new limiter cannot silently share a
   * keyspace with an existing one.
   */
  readonly namespace: string;
  /** Prune on roughly one call in this many. `0` disables pruning. Default 200. */
  readonly pruneEvery?: number;
  /** Maximum expired rows removed per prune. Default 500. */
  readonly pruneBatchSize?: number;
  /** Injectable for tests; defaults to `Math.random`. */
  readonly random?: () => number;
}

interface ConsumeRow {
  readonly out_hit_count: number;
  readonly out_reset_at: string;
}

/**
 * Separates namespace from key before hashing, so `("a", "b:c")` and
 * `("a:b", "c")` can never produce the same digest. NUL cannot occur in a
 * namespace or in any key a caller builds from ids and prefixes.
 *
 * Built with `String.fromCharCode` rather than written as an escape
 * sequence on purpose: an escaped NUL once reached this file as a raw NUL
 * byte, which is invisible in review and makes git treat the whole file as
 * binary. The runtime value is identical either way.
 */
const KEY_SEPARATOR = String.fromCharCode(0);

/** SHA-256 hex of the namespaced key — exported so tests can locate rows without duplicating the rule. */
export function hashRateLimitKey(namespace: string, key: string): string {
  return createHash('sha256').update(`${namespace}${KEY_SEPARATOR}${key}`, 'utf8').digest('hex');
}

export function createPostgresRateLimitStore(
  options: PostgresRateLimitStoreOptions,
): RateLimitStoreAdapter {
  const {
    client,
    namespace,
    pruneEvery = 200,
    pruneBatchSize = 500,
    random = Math.random,
  } = options;

  if (!namespace) {
    throw new Error('rate limit store requires a non-empty namespace');
  }

  function maybePrune(nowMs: number): void {
    if (pruneEvery <= 0 || random() >= 1 / pruneEvery) return;
    // `.then` is what actually dispatches a PostgREST builder; both
    // callbacks are no-ops so a failed prune can never become an unhandled
    // rejection. See the module comment on why this is not awaited.
    void client
      .rpc('rate_limit_prune', {
        p_now: new Date(nowMs).toISOString(),
        p_limit: pruneBatchSize,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return {
    async incrementAndGet(key, windowMs, nowMs) {
      if (!Number.isInteger(windowMs) || windowMs <= 0 || windowMs > MAX_WINDOW_MS) {
        throw new Error('rate limit window must be a positive integer number of milliseconds');
      }
      if (!Number.isFinite(nowMs)) {
        throw new Error('rate limit timestamp must be finite');
      }

      const { data, error } = await client.rpc('rate_limit_consume', {
        p_key_hash: hashRateLimitKey(namespace, key),
        p_window_ms: windowMs,
        p_now: new Date(nowMs).toISOString(),
      });
      if (error) {
        throw new Error(`rate limit consume failed: ${error.code ?? 'unknown'}`);
      }

      const row = (data as ConsumeRow[] | null)?.[0];
      const resetAt = row ? Date.parse(row.out_reset_at) : Number.NaN;
      if (!row || !Number.isInteger(row.out_hit_count) || !Number.isFinite(resetAt)) {
        throw new Error('rate limit consume returned an unexpected shape');
      }

      maybePrune(nowMs);
      return { count: row.out_hit_count, resetAt };
    },
  };
}
