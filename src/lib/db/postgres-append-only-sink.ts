/**
 * Postgres-backed `AppendOnlySink<T>` — the fourth repository adapter
 * (D-064's sequence). Not wired into any `deps.ts`; every domain still
 * runs on its in-memory store.
 *
 * The simplest interface of the set — append and list, no compare-and-set
 * and no atomic claim — so this adapter is mostly mapping. What makes it
 * worth care is the other side: `status_events`, `audit_events`, and
 * `consent_events` each carry a `forbid_row_change()` trigger rejecting
 * every UPDATE and DELETE. That is enforcement, not convention, and it
 * applies to `service_role` too, because a trigger is not role-scoped.
 * Nothing here may offer an update or delete path, and nothing that writes
 * through it can be walked back — including in tests, which cannot clean
 * up after themselves and must instead find their own rows by a unique
 * marker.
 *
 * `list()` returns every row, matching the interface. That is faithful but
 * grows without bound on an event table, and the interface's own doc
 * comment already anticipates the fix ("the same place a real adapter's
 * `WHERE entity_id = ...` would live"). Pushing the filter down is a
 * separate change to the interface, not something to smuggle in here, so
 * this pages rather than truncating: PostgREST caps a response at
 * `max_rows` (1000 in `supabase/config.toml`), and a silent cap on an
 * audit trail would drop history with nothing to show anything was
 * missing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { AppendOnlySink } from '../domain/sink';

assertServerOnly('src/lib/db/postgres-append-only-sink.ts');

const PAGE_SIZE = 500;

export interface PostgresAppendOnlySinkOptions<T, Row> {
  readonly client: SupabaseClient;
  readonly table: string;
  /** Explicit column list, so a future column cannot silently change what is read. */
  readonly select: string;
  /** Column used to order `list()`; these tables record `created_at`. */
  readonly orderBy: string;
  readonly toRecord: (row: Row) => T;
  readonly toInsert: (event: T) => Record<string, unknown>;
}

export function createPostgresAppendOnlySink<T, Row>(
  options: PostgresAppendOnlySinkOptions<T, Row>,
): AppendOnlySink<T> {
  const { client, table, select, orderBy, toRecord, toInsert } = options;

  return {
    async append(event) {
      const { error } = await client.from(table).insert(toInsert(event));
      if (error) {
        throw new Error(`${table} append failed: ${error.code ?? 'unknown'}`);
      }
    },

    async list() {
      const records: T[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from(table)
          .select(select)
          .order(orderBy, { ascending: true })
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
