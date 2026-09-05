/**
 * Postgres-backed `VersionedStore<T>` — the third repository adapter
 * (D-064's sequence). Like the others it is **not** wired into any
 * `deps.ts`; every domain still runs on its in-memory store.
 *
 * Generic over the record because three tables share this interface
 * (`takeaway_requests`, `booking_requests`, `event_requests`) and none of
 * them maps 1:1 onto its domain record. Rather than guess a naming
 * convention, the caller supplies the mapping in both directions; the
 * per-domain modules that compose this hold those decisions and document
 * them.
 *
 * ## The database owns `version`, and that is deliberate
 *
 * `set_row_updated()` is a BEFORE UPDATE trigger on all three tables and
 * does `new.version := old.version + 1`. So this adapter must never write
 * `version` itself — it only *matches* on it. The result is the same
 * post-condition the in-memory store produces (`version: existing.version
 * + 1`), reached by the database rather than by application code, which is
 * what makes the compare-and-set genuinely atomic.
 *
 * ## `updateIfVersionMatches` is one statement
 *
 * `UPDATE ... WHERE id = ? AND version = ? RETURNING ...`. A caller whose
 * expected version is stale matches zero rows and gets `null` — a normal
 * outcome ("someone changed it first"), not an error. Never a read
 * followed by a write.
 *
 * ## These tables also enforce their own state machines
 *
 * `enforce_takeaway_state()` and its siblings reject illegal transitions in
 * the database. Their transition tables were checked against the
 * TypeScript ones (`modules/*\/state-machine.ts`) and agree exactly, so the
 * trigger is a safety net rather than a second, competing opinion — but an
 * illegal transition throws here instead of returning `null`, which is
 * correct: a version mismatch is expected contention, whereas an illegal
 * transition is a bug.
 *
 * ## `session_id` is a real foreign key into `customer_sessions` (D-078)
 *
 * All three tables carry a `session_id` column referencing
 * `customer_sessions(id)`; nothing in this codebase's guest-session layer
 * has ever written that row. The optional `getSessionId` mapping, when
 * supplied, calls `ensureCustomerSessionRow` before `create()`'s own
 * insert — one shared fix for all three domains rather than three
 * duplicated call sites.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { VersionedRecord, VersionedStore } from '../domain/versioned-store';
import { ensureCustomerSessionRow } from './postgres-customer-session';

assertServerOnly('src/lib/db/postgres-versioned-store.ts');

/**
 * PostgREST caps a response at `max_rows` (1000 in `supabase/config.toml`).
 * `list()` therefore pages explicitly: a silent cap would drop requests off
 * the end of a staff queue with nothing to indicate anything was missing.
 */
const PAGE_SIZE = 500;

export interface PostgresVersionedStoreOptions<T extends VersionedRecord, Row> {
  readonly client: SupabaseClient;
  readonly table: string;
  /** Explicit column list, so a future column cannot silently change what is read. */
  readonly select: string;
  readonly toRecord: (row: Row) => T;
  /**
   * Full row for `create`, including `id`; `version` is left to the column
   * default. May be async: `takeaway_requests` has to resolve the domain's
   * `menuVersionNumber` to a `menu_versions` foreign key, which needs a
   * query. Mappings with nothing to look up (bookings) simply return an
   * object and are unaffected.
   */
  readonly toInsert: (record: T) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Column patch for an update. Must never include `id` or `version`. */
  readonly toPatch: (patch: Partial<Omit<T, 'id' | 'version'>>) => Record<string, unknown>;
  /**
   * Extracts the guest session id from a record about to be `create()`d,
   * when the table's `session_id` column is a real foreign key into
   * `customer_sessions` — see this file's own doc comment (D-078). Omit
   * for a table with no such column. A `null`/empty return skips the
   * ensure-call (nothing to satisfy).
   */
  readonly getSessionId?: (record: T) => string | null;
}

export function createPostgresVersionedStore<T extends VersionedRecord, Row>(
  options: PostgresVersionedStoreOptions<T, Row>,
): VersionedStore<T> {
  const { client, table, select, toRecord, toInsert, toPatch, getSessionId } = options;

  return {
    async find(id) {
      const { data, error } = await client
        .from(table)
        .select(select)
        .eq('id', id)
        .maybeSingle<Row>();
      if (error) {
        throw new Error(`${table} find failed: ${error.code ?? 'unknown'}`);
      }
      return data ? toRecord(data) : null;
    },

    async create(record) {
      const sessionId = getSessionId?.(record);
      if (sessionId) await ensureCustomerSessionRow(client, sessionId);
      const { error } = await client.from(table).insert(await toInsert(record));
      if (error) {
        throw new Error(`${table} create failed: ${error.code ?? 'unknown'}`);
      }
    },

    async updateIfVersionMatches(id, expectedVersion, patch) {
      const columns = toPatch(patch);
      // An empty patch would be rejected by PostgREST, while the in-memory
      // store still bumps the version. Touching `updated_at` keeps the two
      // equivalent; the trigger overwrites the value with `now()` anyway,
      // so what is sent here does not matter, only that a column is set.
      const payload =
        Object.keys(columns).length > 0 ? columns : { updated_at: new Date().toISOString() };

      const { data, error } = await client
        .from(table)
        .update(payload)
        .eq('id', id)
        .eq('version', expectedVersion)
        .select(select)
        .maybeSingle<Row>();
      if (error) {
        throw new Error(`${table} update failed: ${error.code ?? 'unknown'}`);
      }
      return data ? toRecord(data) : null;
    },

    async list() {
      const records: T[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from(table)
          .select(select)
          .order('created_at', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
          .returns<Row[]>();
        if (error) {
          throw new Error(`${table} list failed: ${error.code ?? 'unknown'}`);
        }
        const page = data ?? [];
        for (const row of page) records.push(toRecord(row));
        if (page.length < PAGE_SIZE) break;
      }
      return records;
    },
  };
}
