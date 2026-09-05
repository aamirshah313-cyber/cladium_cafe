/**
 * Postgres-backed `ConfirmationTokenStore` — the first real repository
 * adapter, closing the first slice of D-023's standing gap ("domain data
 * lives in memory until a real Postgres repository layer is built").
 *
 * Deliberately the first adapter built: `confirmation_tokens` maps 1:1
 * onto `ConfirmationTokenRecord` with no shape mismatch, and its one
 * atomic operation is small and precisely specified, so it establishes
 * the pattern (client wiring, row mapping, single-statement atomicity,
 * real integration tests) at the lowest risk before the harder primitives
 * (idempotency, versioned records, outbox) follow.
 *
 * Server-only and service-role, matching `supabase-admin-client.ts`. The
 * service role bypasses RLS by design; this store is never reachable from
 * guest code, and no guest-write RLS policy was added for it (the audit
 * that preceded this work confirmed the existing service-role-only write
 * pattern is the right one and that widening RLS would be a real
 * regression).
 *
 * Errors throw rather than returning `null`. The interface has no error
 * channel, and a swallowed write error would look exactly like success,
 * which is the one outcome a single-use security token must never
 * produce. A swallowed *read* error would fail closed (every token would
 * look invalid) but would also hide a real outage completely, so reads
 * throw too.
 *
 * `session_id` is a real, `NOT NULL` foreign key into `customer_sessions`
 * — `save()` calls `ensureCustomerSessionRow` first (D-078's own fix):
 * nothing else in this codebase's guest-session layer has ever written
 * that row, so this adapter cannot assume one already exists.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type {
  ConfirmationAction,
  ConfirmationTokenRecord,
  ConfirmationTokenStore,
} from '../domain/confirmation-token';
import { ensureCustomerSessionRow } from './postgres-customer-session';

assertServerOnly('src/lib/db/postgres-confirmation-token-store.ts');

const TABLE = 'confirmation_tokens';

/**
 * `id`, `issued_context`, and `version` are deliberately absent: the
 * domain record has no equivalent for them and the schema defaults cover
 * all three. Selecting only mapped columns also means a future column
 * addition cannot silently change what this adapter reads.
 */
const SELECT = 'token_hash, session_id, action, review_hash, created_at, expires_at, used_at';

interface ConfirmationTokenRow {
  readonly token_hash: string;
  readonly session_id: string;
  readonly action: ConfirmationAction;
  readonly review_hash: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly used_at: string | null;
}

/**
 * Postgres renders `timestamptz` as `2026-09-04T10:00:00+00:00`, while
 * the domain's timestamps are always JavaScript `toISOString()` output
 * (`2026-09-04T10:00:00.000Z`). Those are the same instant but different
 * strings, and the domain types these fields as plain `string` — so
 * without normalising, a value written through this adapter would come
 * back in a shape the in-memory store never produces, and any caller
 * comparing or hashing the string would silently diverge by backend.
 * Found by the round-trip integration test, not by reasoning about it.
 */
function toIsoString(value: string): string {
  return new Date(value).toISOString();
}

/**
 * `created_at` carries `issuedAt`: the domain treats issuance as the
 * record's creation, and the adapter writes it explicitly rather than
 * leaning on the column default so a caller-supplied clock (which every
 * test and the deterministic-time paths rely on) stays authoritative.
 */
function toRecord(row: ConfirmationTokenRow): ConfirmationTokenRecord {
  return {
    tokenHash: row.token_hash,
    sessionId: row.session_id,
    action: row.action,
    reviewHash: row.review_hash,
    issuedAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    usedAt: row.used_at === null ? null : toIsoString(row.used_at),
  };
}

export function createPostgresConfirmationTokenStore(
  client: SupabaseClient,
): ConfirmationTokenStore {
  return {
    async save(record) {
      await ensureCustomerSessionRow(client, record.sessionId);
      const { error } = await client.from(TABLE).insert({
        token_hash: record.tokenHash,
        session_id: record.sessionId,
        action: record.action,
        review_hash: record.reviewHash,
        created_at: record.issuedAt,
        updated_at: record.issuedAt,
        expires_at: record.expiresAt,
        used_at: record.usedAt,
      });
      if (error) {
        throw new Error(`confirmation token save failed: ${error.code ?? 'unknown'}`);
      }
    },

    async find(tokenHash) {
      const { data, error } = await client
        .from(TABLE)
        .select(SELECT)
        .eq('token_hash', tokenHash)
        .maybeSingle<ConfirmationTokenRow>();
      if (error) {
        throw new Error(`confirmation token lookup failed: ${error.code ?? 'unknown'}`);
      }
      return data ? toRecord(data) : null;
    },

    /**
     * One conditional `UPDATE ... WHERE used_at IS NULL RETURNING ...`,
     * exactly as the interface requires — never a read followed by a
     * write. Under two genuinely concurrent claims the second blocks on
     * the row lock, re-evaluates the predicate against the committed new
     * version, matches zero rows, and correctly returns `null`.
     *
     * Returns the record's **pre-use** state (`usedAt: null`), matching
     * the in-memory store, which returns the value it read before
     * overwriting it. PostgREST hands back the post-update row, so the
     * field is restored here rather than reported as the row now reads —
     * and that is sound precisely because the `is('used_at', null)`
     * predicate is what allowed the update to happen at all.
     */
    async claimIfUnused(tokenHash, now) {
      const usedAt = now.toISOString();
      const { data, error } = await client
        .from(TABLE)
        .update({ used_at: usedAt, updated_at: usedAt })
        .eq('token_hash', tokenHash)
        .is('used_at', null)
        .select(SELECT)
        .maybeSingle<ConfirmationTokenRow>();
      if (error) {
        throw new Error(`confirmation token claim failed: ${error.code ?? 'unknown'}`);
      }
      return data ? { ...toRecord(data), usedAt: null } : null;
    },
  };
}
