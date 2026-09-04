/**
 * Postgres-backed `OutboxStore` — the fifth and last repository primitive
 * (D-064's sequence). Not wired into any `deps.ts`; the dispatcher still
 * runs on the in-memory store.
 *
 * The most concurrency-sensitive adapter of the set, because the whole
 * point of an outbox is that several dispatcher workers may run at once
 * and no event may be delivered twice or stranded.
 *
 * ## `claimBatch` is a database function, not a query pair
 *
 * Selecting due rows and then marking them CLAIMED is exactly the shape
 * the interface forbids: two workers both read the same rows as claimable
 * before either writes. `outbox_claim_batch` does it in one statement with
 * `FOR UPDATE SKIP LOCKED`, so a second worker skips what the first holds
 * rather than blocking on it or claiming it twice.
 *
 * ## Stale claims are reclaimed, and that is not optional
 *
 * A worker that dies between claiming and resolving would otherwise leave
 * its rows in CLAIMED forever — never retried, never delivered, and
 * invisible because nothing is in an error state. `staleClaimMs` is what
 * lets another worker take them back.
 *
 * ## The database owns `version` and `attempt_count`
 *
 * `outbox_events_set_updated` bumps `version` on every UPDATE, so nothing
 * here writes it — the marks only *match* on it, which is what makes
 * "resolve this claim" a compare-and-set rather than a blind write. The
 * increments of `attempt_count` live in SQL for the same reason: read-then-
 * write would lose an increment whenever two workers raced.
 *
 * `markDelivered` sets only literal values, so it goes through PostgREST
 * as a plain conditional update; the other two need the increment and so
 * are functions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { OutboxEvent, OutboxStatus } from '../domain/outbox';
import type { OutboxStore } from '../domain/outbox-store';

assertServerOnly('src/lib/db/postgres-outbox-store.ts');

const TABLE = 'outbox_events';
const PAGE_SIZE = 500;

const SELECT =
  'id, version, event_type, entity_type, entity_id, payload, destination, status, ' +
  'attempt_count, next_attempt_at, claimed_at, delivered_at, failed_permanently_at, ' +
  'last_error, created_at';

interface OutboxRow {
  readonly id: string;
  readonly version: number;
  readonly event_type: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly payload: Record<string, unknown> | null;
  readonly destination: string;
  readonly status: OutboxStatus;
  readonly attempt_count: number;
  readonly next_attempt_at: string | null;
  readonly claimed_at: string | null;
  readonly delivered_at: string | null;
  readonly failed_permanently_at: string | null;
  readonly last_error: string | null;
  readonly created_at: string;
}

/** Postgres renders `timestamptz` as `+00:00`; the domain always uses `toISOString()`'s `.000Z`. See D-064. */
function iso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function toRecord(row: OutboxRow): OutboxEvent {
  return {
    id: row.id,
    version: row.version,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload ?? {},
    destination: row.destination,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: iso(row.next_attempt_at),
    claimedAt: iso(row.claimed_at),
    deliveredAt: iso(row.delivered_at),
    // The domain calls this `failedAt`; the column is `failed_permanently_at`.
    failedAt: iso(row.failed_permanently_at),
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createPostgresOutboxStore(client: SupabaseClient): OutboxStore {
  return {
    async append(event) {
      const { error } = await client.from(TABLE).insert({
        id: event.id,
        event_type: event.eventType,
        entity_type: event.entityType,
        entity_id: event.entityId,
        payload: event.payload,
        destination: event.destination,
        status: event.status,
        attempt_count: event.attemptCount,
        // The column is NOT NULL while the domain types this nullable.
        // `buildOutboxEvent` always sets it (a fresh row is due
        // immediately), so this fallback only covers a hand-built event.
        next_attempt_at: event.nextAttemptAt ?? event.createdAt,
        claimed_at: event.claimedAt,
        delivered_at: event.deliveredAt,
        failed_permanently_at: event.failedAt,
        last_error: event.lastError,
        created_at: event.createdAt,
      });
      if (error) {
        throw new Error(`outbox append failed: ${error.code ?? 'unknown'}`);
      }
    },

    async list() {
      const records: OutboxEvent[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from(TABLE)
          .select(SELECT)
          .order('created_at', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
          .returns<OutboxRow[]>();
        if (error) {
          throw new Error(`outbox list failed: ${error.code ?? 'unknown'}`);
        }
        const page = data ?? [];
        for (const row of page) records.push(toRecord(row));
        if (page.length < PAGE_SIZE) break;
      }
      return records;
    },

    async claimBatch({ limit, now, staleClaimMs }) {
      const { data, error } = await client.rpc('outbox_claim_batch', {
        p_limit: limit,
        p_now: now.toISOString(),
        p_stale_claim_ms: staleClaimMs,
      });
      if (error) {
        throw new Error(`outbox claimBatch failed: ${error.code ?? 'unknown'}`);
      }
      return ((data ?? []) as readonly OutboxRow[]).map(toRecord);
    },

    async markDelivered(id, expectedVersion, now) {
      // Only literal values, so PostgREST expresses this fine. The
      // `delivered_at` write is required by outbox_events_delivered_consistent.
      const { data, error } = await client
        .from(TABLE)
        .update({ status: 'DELIVERED', delivered_at: now.toISOString(), last_error: null })
        .eq('id', id)
        .eq('version', expectedVersion)
        .select('id')
        .maybeSingle<{ id: string }>();
      if (error) {
        throw new Error(`outbox markDelivered failed: ${error.code ?? 'unknown'}`);
      }
      return data !== null;
    },

    async markRetry(id, expectedVersion, input) {
      const { data, error } = await client.rpc('outbox_mark_retry', {
        p_id: id,
        p_expected_version: expectedVersion,
        p_next_attempt_at: input.nextAttemptAt.toISOString(),
        p_last_error: input.lastError,
      });
      if (error) {
        throw new Error(`outbox markRetry failed: ${error.code ?? 'unknown'}`);
      }
      return data === true;
    },

    async markTerminal(id, expectedVersion, input, now) {
      const { data, error } = await client.rpc('outbox_mark_terminal', {
        p_id: id,
        p_expected_version: expectedVersion,
        p_last_error: input.lastError,
        p_now: now.toISOString(),
      });
      if (error) {
        throw new Error(`outbox markTerminal failed: ${error.code ?? 'unknown'}`);
      }
      return data === true;
    },
  };
}
