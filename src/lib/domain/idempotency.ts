/**
 * Idempotent execution — Runbook Steps 19 and 21 (data-model-v2.md
 * `idempotency_keys`).
 *
 * "Scoped to actor/session plus operation. Store request fingerprint,
 * result reference, status, and expiry. Reusing a key with a different
 * fingerprint is rejected." `runIdempotent` is the one reusable seam every
 * submission service (`modules/takeaway`, `modules/bookings`,
 * `modules/events`) calls through, so a route can never re-run a mutation
 * twice by accident — a replayed request with the same key+fingerprint
 * gets back the original result instead of executing again.
 *
 * `findOrBegin` is one atomic store operation, not "read, then decide,
 * then write": a store's implementation must check and, if absent (or
 * `FAILED`), write the fresh `IN_PROGRESS` record within the same
 * synchronous turn, with no `await` in between. Step 19 originally split
 * this into separate `find`/`begin` calls; two truly concurrent callers
 * (a genuine double-click, not just two sequential calls) could both
 * `await` the read before either `await`ed the write, so both saw "no
 * record yet" and both ran `fn` — found by an explicit `Promise.all`
 * concurrency test, not a sequential one (sequential calls never
 * interleave, so the original tests all passed regardless).
 */

import { err, ok, type Result } from '../result';
import { idempotencyConflict, type AppError } from '../errors';

export type IdempotencyStatus = 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';

export interface IdempotencyRecord<R> {
  readonly scope: string;
  readonly key: string;
  readonly fingerprint: string;
  readonly status: IdempotencyStatus;
  readonly result: R | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IdempotencyStore<R> {
  /**
   * Atomically returns the existing record for `scope`+`key` if one is
   * still blocking (any fingerprint, or `IN_PROGRESS`/`SUCCEEDED`), or
   * begins a fresh `IN_PROGRESS` record and returns `null` — meaning "not
   * blocked, proceed." A prior `FAILED` attempt with the *same* fingerprint
   * is silently replaced by the fresh one (a safe retry); a `FAILED`
   * attempt with a *different* fingerprint is still returned as blocking,
   * so the fingerprint mismatch is reported the same as any other reuse.
   */
  findOrBegin(
    scope: string,
    key: string,
    fingerprint: string,
    now: Date,
  ): Promise<IdempotencyRecord<R> | null>;
  complete(scope: string, key: string, result: R, now: Date): Promise<void>;
  fail(scope: string, key: string, now: Date): Promise<void>;
}

export function createInMemoryIdempotencyStore<R>(): IdempotencyStore<R> & {
  readonly records: ReadonlyMap<string, IdempotencyRecord<R>>;
} {
  const records = new Map<string, IdempotencyRecord<R>>();
  const recordKey = (scope: string, key: string) => `${scope} ${key}`;

  return {
    records,
    // No `await` before the Map write below — see the interface doc comment
    // for why that is exactly what makes this safe under real concurrency.
    async findOrBegin(scope, key, fingerprint, now) {
      const k = recordKey(scope, key);
      const existing = records.get(k);

      if (existing && existing.fingerprint === fingerprint && existing.status === 'FAILED') {
        records.set(k, {
          ...existing,
          status: 'IN_PROGRESS',
          result: null,
          updatedAt: now.toISOString(),
        });
        return null;
      }
      if (existing) return existing;

      records.set(k, {
        scope,
        key,
        fingerprint,
        status: 'IN_PROGRESS',
        result: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      return null;
    },
    async complete(scope, key, result, now) {
      const existing = records.get(recordKey(scope, key));
      if (!existing) return;
      records.set(recordKey(scope, key), {
        ...existing,
        status: 'SUCCEEDED',
        result,
        updatedAt: now.toISOString(),
      });
    },
    async fail(scope, key, now) {
      const existing = records.get(recordKey(scope, key));
      if (!existing) return;
      records.set(recordKey(scope, key), {
        ...existing,
        status: 'FAILED',
        updatedAt: now.toISOString(),
      });
    },
  };
}

export interface RunIdempotentInput {
  readonly scope: string;
  readonly key: string;
  readonly fingerprint: string;
  readonly now?: () => Date;
  readonly correlationId?: string;
}

/**
 * Same key + same fingerprint replays the stored result without re-running
 * `fn`. Same key + a *different* fingerprint is rejected — the spec's
 * "reusing a key with a different fingerprint is rejected." A key still
 * `IN_PROGRESS` (a genuine concurrent duplicate, not just a sequential
 * replay) is also rejected rather than running `fn` twice at once.
 *
 * `fn` throwing (rather than returning `err(...)`) is caught and marked
 * `FAILED` before the exception is rethrown. Found while wiring the first
 * durable `IdempotencyStore`: every Postgres adapter in `lib/db` throws on
 * a write failure by design (D-064 — the interfaces have no error channel,
 * and a swallowed error would look like success), so a transient DB error
 * inside `fn` used to leave the fresh `IN_PROGRESS` record `findOrBegin`
 * had just written completely unresolved. Against the in-memory store that
 * was survivable — a crash erased the whole record anyway, so the next
 * attempt started clean. Against a durable store it is not: the record
 * persists past any restart, `expires_at` is deliberately never
 * interpreted on read (D-065), and every retry with the same key would
 * have returned `idempotencyConflict` forever, with no path back. Marking
 * it `FAILED` here restores the retry behaviour this function has always
 * had, regardless of which store backs it.
 */
export async function runIdempotent<R>(
  store: IdempotencyStore<R>,
  input: RunIdempotentInput,
  fn: () => Promise<Result<R, AppError>>,
): Promise<Result<R, AppError>> {
  const now = input.now ?? (() => new Date());
  const existing = await store.findOrBegin(input.scope, input.key, input.fingerprint, now());

  if (existing) {
    if (existing.fingerprint !== input.fingerprint) {
      return err(idempotencyConflict(input.correlationId));
    }
    if (existing.status === 'SUCCEEDED' && existing.result !== null) {
      return ok(existing.result);
    }
    // Only IN_PROGRESS reaches here with a matching fingerprint —
    // findOrBegin already re-began a matching-fingerprint FAILED record.
    return err(idempotencyConflict(input.correlationId));
  }

  let result: Result<R, AppError>;
  try {
    result = await fn();
  } catch (thrown) {
    try {
      await store.fail(input.scope, input.key, now());
    } catch (failError) {
      // Recording the failure failed too (e.g. the same outage that broke
      // fn). The original error is the one worth surfacing — it is not
      // swallowed, only attached as `cause` so nothing is lost.
      throw new Error('runIdempotent: fn() threw and store.fail() also threw while recording it', {
        cause: { thrown, failError },
      });
    }
    throw thrown;
  }

  if (result.ok) {
    await store.complete(input.scope, input.key, result.value, now());
  } else {
    await store.fail(input.scope, input.key, now());
  }
  return result;
}
