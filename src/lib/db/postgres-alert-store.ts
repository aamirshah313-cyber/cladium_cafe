/**
 * Postgres-backed `AlertStore` — the durable half of operational alerting
 * (item 8 of Step 45's punch list, D-049).
 *
 * ## `increment` is one statement, and that is the whole point
 *
 * It calls `operational_counter_increment`, which is a single upsert. Every
 * serverless instance handling a request increments the same bucket
 * concurrently, so a read-then-write here would lose counts under exactly
 * the load an alert exists to detect — the same class of bug D-045 found in
 * the in-memory rate limiter, where concurrent callers all read a stale
 * value. Bucket truncation happens inside the function rather than here so
 * two call sites cannot disagree about where a minute begins.
 *
 * ## Totals are aggregated in the database
 *
 * `totalsSince` calls `operational_counter_totals` rather than selecting
 * buckets and summing them here. A 1-hour window across every kind and
 * label is a lot of rows to move in order to produce a handful of numbers,
 * and the ratio itself is deliberately *not* computed in SQL — that lives
 * in `modules/alerting/thresholds.ts`, because a threshold split across two
 * languages is a threshold that will eventually disagree with itself.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { OperationalKind, OperationalTotals } from '../../modules/alerting/operational-event';
import type { AlertStore, RecordedFiring } from '../../modules/alerting/alert-store';

assertServerOnly('src/lib/db/postgres-alert-store.ts');

const COUNTERS_TABLE = 'operational_counters';
const FIRINGS_TABLE = 'alert_firings';

interface TotalsRow {
  readonly kind: OperationalKind;
  readonly label: string;
  readonly ok_count: number | string;
  readonly bad_count: number | string;
}

interface FiringRow {
  readonly alert_key: string;
  readonly fired_at: string;
}

export function createPostgresAlertStore(client: SupabaseClient): AlertStore {
  return {
    async increment(occurrence, now) {
      const { error } = await client.rpc('operational_counter_increment', {
        p_kind: occurrence.kind,
        p_label: occurrence.label,
        p_outcome: occurrence.outcome,
        p_now: now.toISOString(),
      });
      // Thrown, not swallowed: `recordOperationalOccurrence` is the layer
      // that decides a counter failure must never reach a guest, and it
      // needs to see the failure in order to log it.
      if (error)
        throw new Error(`operational counter increment failed: ${error.code ?? 'unknown'}`);
    },

    async totalsSince(since) {
      const { data, error } = await client.rpc('operational_counter_totals', {
        p_since: since.toISOString(),
      });
      if (error) throw new Error(`operational counter totals failed: ${error.code ?? 'unknown'}`);
      // Cast rather than `.returns<T>()`, same as `postgres-outbox-store.ts`'s
      // `claimBatch`: there are no generated types for these functions.
      // `count(*)` is bigint, which some driver configurations render as a
      // string, so both are normalized through `Number`.
      return ((data ?? []) as readonly TotalsRow[]).map((row): OperationalTotals => ({
        kind: row.kind,
        label: row.label,
        okCount: Number(row.ok_count),
        badCount: Number(row.bad_count),
      }));
    },

    async lastFiredAtByKey() {
      // Ordered newest-first and reduced client-side rather than with a
      // per-key `distinct on`: the table is small (one row per fired alert,
      // bounded by the cooldown) and PostgREST has no clean `distinct on`.
      const { data, error } = await client
        .from(FIRINGS_TABLE)
        .select('alert_key, fired_at')
        .order('fired_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(`alert firings read failed: ${error.code ?? 'unknown'}`);

      const latest: Record<string, string> = {};
      for (const row of (data ?? []) as readonly FiringRow[]) {
        if (latest[row.alert_key] === undefined) {
          latest[row.alert_key] = new Date(row.fired_at).toISOString();
        }
      }
      return latest;
    },

    async recordFiring(firing: RecordedFiring) {
      const { error } = await client.from(FIRINGS_TABLE).insert({
        alert_key: firing.alertKey,
        window_seconds: firing.windowSeconds,
        numerator: firing.numerator,
        denominator: firing.denominator,
        observed_rate: firing.observedRate,
        threshold_rate: firing.thresholdRate,
        fired_at: firing.firedAt,
      });
      if (error) throw new Error(`alert firing insert failed: ${error.code ?? 'unknown'}`);
    },

    async pruneCountersBefore(cutoff) {
      const { error, count } = await client
        .from(COUNTERS_TABLE)
        .delete({ count: 'exact' })
        .lt('bucket_minute', cutoff.toISOString());
      if (error) throw new Error(`operational counter prune failed: ${error.code ?? 'unknown'}`);
      return count ?? 0;
    },
  };
}

/**
 * Dispatched-vs-permanently-failed totals for the outbox threshold.
 *
 * Deliberately not part of `AlertStore`: this reads `outbox_events`, which
 * is another module's table and already the source of truth for its own
 * state. Counting it into `operational_counters` too would mean two records
 * of the same fact, free to disagree — so the threshold reads the real
 * table instead, and the port stays about the signals that had nowhere else
 * to live.
 *
 * The denominator is everything that reached a *terminal* state in the
 * window (`DELIVERED` or `FAILED`), not everything created. An event still
 * retrying has not yet succeeded or failed, and counting it as a
 * denominator would dilute the rate exactly while a real incident is
 * building — the moment the alert most needs to be sensitive.
 */
export function createPostgresOutboxDispatchTotals(
  client: SupabaseClient,
): (since: Date) => Promise<{ readonly failed: number; readonly dispatched: number }> {
  return async (since: Date) => {
    const sinceIso = since.toISOString();

    const failedQuery = client
      .from('outbox_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'FAILED')
      .gte('failed_permanently_at', sinceIso);

    const deliveredQuery = client
      .from('outbox_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'DELIVERED')
      .gte('delivered_at', sinceIso);

    const [failedResult, deliveredResult] = await Promise.all([failedQuery, deliveredQuery]);
    if (failedResult.error) {
      throw new Error(`outbox failed-count failed: ${failedResult.error.code ?? 'unknown'}`);
    }
    if (deliveredResult.error) {
      throw new Error(`outbox delivered-count failed: ${deliveredResult.error.code ?? 'unknown'}`);
    }

    const failed = failedResult.count ?? 0;
    const delivered = deliveredResult.count ?? 0;
    return { failed, dispatched: failed + delivered };
  };
}
