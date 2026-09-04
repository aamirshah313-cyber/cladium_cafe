/**
 * Postgres-backed `IdempotencyStore` — the second repository adapter
 * (D-023 / D-064's sequence). Like the first, it is **not** wired into any
 * `deps.ts`; every domain still runs on its in-memory store.
 *
 * Unlike `confirmation_tokens`, this table does NOT map 1:1 onto its
 * domain record, and each gap below is a deliberate, documented decision
 * rather than an oversight.
 *
 * ## 1. The fingerprint is a raw secret, so it is hashed before storage
 *
 * All three submission services pass `fingerprint: input.confirmationToken`
 * — the *raw*, still-valid, single-use confirmation token. The in-memory
 * store holds that only in process memory, but persisting it would put a
 * live secret into the database, its backups, and its replicas. That
 * directly contradicts the schema's own stated rule for this value
 * ("Hash only, never the raw token") and `confirmation-token.ts`'s promise
 * that "a database read can never recover a live token." It also matters
 * in ordering terms: `findOrBegin` runs *before* the token is consumed, so
 * the window would contain a token that is still usable.
 *
 * The fingerprint is only ever compared for equality (`runIdempotent` does
 * `existing.fingerprint !== input.fingerprint` and nothing else), and
 * hashing preserves equality exactly. So the SHA-256 hash is what is
 * stored, and a returned record reports the caller's own raw fingerprint
 * when the stored hash matches it — otherwise it reports the stored hash,
 * which cannot equal any raw token and so is correctly seen as a
 * conflicting fingerprint. SHA-256 hex is 64 chars, inside the column's
 * 32–128 constraint.
 *
 * ## 2. `scope` is stored whole, with `operation` supplied per store
 *
 * The domain's `scope` is one opaque string (today
 * `"<sessionId>:submitTakeawayRequest"`), while the table splits actor from
 * operation and constrains `operation` to `^[a-z][a-z0-9_.]*$` — which
 * `submitTakeawayRequest` fails on case alone. Rather than reverse-engineer
 * the caller's string format, the whole `scope` goes in `actor_key` and
 * `operation` is a snake_case constant supplied when the store is
 * constructed. Uniqueness is unaffected: `(actor_key, operation,
 * idempotency_key)` is unique exactly when `(scope, key)` is, because
 * `operation` is fixed per store.
 *
 * ## 3. `result` is stored as an entity reference, not a blob
 *
 * The table stores `result_entity_type` + `result_entity_id uuid`, not an
 * arbitrary `R`. In practice every caller's `R` is
 * `{ requestId: <uuid>, state: <constant> }`, so the store is constructed
 * with the entity type plus functions to project `R` to an id and rebuild
 * it — keeping `IdempotencyStore<R>` itself unchanged.
 *
 * ## 4. Expiry is written but not interpreted
 *
 * `expires_at` is NOT NULL with no default while the domain interface has
 * no expiry concept, so a TTL is supplied at construction. Reads
 * deliberately do NOT treat an expired row as absent: that would make this
 * store behave differently from the in-memory one. Purging expired rows is
 * a separate concern, as `purge_expired_consent_events` already is for
 * consent.
 *
 * Errors throw, for the same reason as the confirmation-token adapter: the
 * interface has no error channel and a swallowed write error would be
 * indistinguishable from success.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { assertServerOnly } from '../server-only';
import type { IdempotencyRecord, IdempotencyStatus, IdempotencyStore } from '../domain/idempotency';

assertServerOnly('src/lib/db/postgres-idempotency-store.ts');

const TABLE = 'idempotency_keys';

interface IdempotencyRow {
  readonly actor_key: string;
  readonly operation: string;
  readonly idempotency_key: string;
  readonly request_fingerprint: string;
  readonly status: IdempotencyStatus;
  readonly result_entity_type: string | null;
  readonly result_entity_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PostgresIdempotencyStoreOptions<R> {
  readonly client: SupabaseClient;
  /** Snake_case, matching the column's `^[a-z][a-z0-9_.]*$` constraint (e.g. `submit_takeaway_request`). */
  readonly operation: string;
  /** Stored in `result_entity_type` (e.g. `takeaway_request`). */
  readonly entityType: string;
  /** Projects a result to the uuid stored in `result_entity_id`. */
  readonly toEntityId: (result: R) => string;
  /** Rebuilds the result from a stored entity id. */
  readonly fromEntityId: (entityId: string) => R;
  /** How long a claimed key stays valid; the column is NOT NULL and the domain has no equivalent. */
  readonly ttlSeconds: number;
}

function hashFingerprint(fingerprint: string): string {
  return createHash('sha256').update(fingerprint, 'utf8').digest('hex');
}

/** Postgres renders `timestamptz` as `+00:00`; the domain always uses `toISOString()`'s `.000Z`. See D-064. */
function toIsoString(value: string): string {
  return new Date(value).toISOString();
}

export function createPostgresIdempotencyStore<R>(
  options: PostgresIdempotencyStoreOptions<R>,
): IdempotencyStore<R> {
  const { client, operation, entityType, toEntityId, fromEntityId, ttlSeconds } = options;

  /**
   * `rawFingerprint` is the value the caller asked about. Reporting it back
   * when it matches the stored hash is what lets `runIdempotent`'s equality
   * check keep working against a hashed column; when it does not match, the
   * stored hash is reported instead and correctly compares unequal.
   */
  function toRecord(row: IdempotencyRow, rawFingerprint: string): IdempotencyRecord<R> {
    const matches = row.request_fingerprint === hashFingerprint(rawFingerprint);
    return {
      scope: row.actor_key,
      key: row.idempotency_key,
      fingerprint: matches ? rawFingerprint : row.request_fingerprint,
      status: row.status,
      result: row.result_entity_id === null ? null : fromEntityId(row.result_entity_id),
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  }

  return {
    async findOrBegin(scope, key, fingerprint, now) {
      const { data, error } = await client.rpc('idempotency_find_or_begin', {
        p_actor_key: scope,
        p_operation: operation,
        p_idempotency_key: key,
        p_request_fingerprint: hashFingerprint(fingerprint),
        p_now: now.toISOString(),
        p_expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
      });
      if (error) {
        throw new Error(`idempotency findOrBegin failed: ${error.code ?? 'unknown'}`);
      }
      // Zero rows means the claim succeeded and the caller may proceed.
      // Read the element rather than testing `length`, so the compiler's
      // `noUncheckedIndexedAccess` narrowing does the work instead of an
      // assertion that would only look safe.
      const rows = (data ?? []) as readonly IdempotencyRow[];
      const blocking = rows[0];
      return blocking === undefined ? null : toRecord(blocking, fingerprint);
    },

    async complete(scope, key, result, now) {
      const { error } = await client
        .from(TABLE)
        .update({
          status: 'SUCCEEDED',
          result_entity_type: entityType,
          result_entity_id: toEntityId(result),
          updated_at: now.toISOString(),
        })
        .eq('actor_key', scope)
        .eq('operation', operation)
        .eq('idempotency_key', key);
      if (error) {
        throw new Error(`idempotency complete failed: ${error.code ?? 'unknown'}`);
      }
    },

    async fail(scope, key, now) {
      const { error } = await client
        .from(TABLE)
        .update({ status: 'FAILED', updated_at: now.toISOString() })
        .eq('actor_key', scope)
        .eq('operation', operation)
        .eq('idempotency_key', key);
      if (error) {
        throw new Error(`idempotency fail failed: ${error.code ?? 'unknown'}`);
      }
    },
  };
}
