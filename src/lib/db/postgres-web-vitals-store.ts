/**
 * Postgres-backed `WebVitalsSampleStore` — the durable half of field
 * telemetry (item 6 of Step 45's punch list, D-049).
 *
 * ## Percentiles are computed in the database, not here
 *
 * `percentilesByRoute`/`percentilesOverall` call the `web_vitals_p75` /
 * `web_vitals_p75_overall` functions from migration `20260919120000` rather
 * than selecting rows and reducing them in JavaScript. Two reasons, both
 * practical: a P75 over a real traffic population means pulling every
 * sample across the wire to throw almost all of it away, and RLS exposes no
 * rows for a raw select anyway — the aggregate functions *are* the read
 * interface this table has.
 *
 * ## `pruneRecordedBefore` is a plain ranged delete
 *
 * Unlike consent-event purging (`purge_expired_consent_events`, a
 * SECURITY DEFINER exception because a guest's own consent proof must be
 * deletable under controlled conditions) there is nothing privileged to
 * mediate here: these rows are anonymous, the service role already holds
 * `delete`, and the retention window is an operational choice. A dedicated
 * function would add indirection without adding a guarantee.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type {
  VitalsPercentile,
  VitalsSample,
  RoutePattern,
  ViewportBucket,
  VitalsMetric,
} from '../../modules/telemetry/vitals-sample';
import type {
  VitalsPercentileQuery,
  WebVitalsSampleStore,
} from '../../modules/telemetry/vitals-store';

assertServerOnly('src/lib/db/postgres-web-vitals-store.ts');

const TABLE = 'web_vitals_samples';

interface PercentileRow {
  readonly metric: VitalsMetric;
  readonly route_pattern?: RoutePattern | null;
  readonly viewport_bucket?: ViewportBucket | null;
  readonly sample_count: number | string;
  readonly p75: number | null;
}

/**
 * Postgres `count(*)` is `bigint`, which PostgREST renders as a JSON number
 * for anything this size but as a string in some driver configurations.
 * Normalizing both keeps `sampleCount` a real number regardless — the same
 * defensiveness `iso()` applies to `timestamptz` rendering in the other
 * adapters (D-064).
 */
function toPercentile(row: PercentileRow): VitalsPercentile {
  return {
    metric: row.metric,
    routePattern: row.route_pattern ?? null,
    viewportBucket: row.viewport_bucket ?? null,
    sampleCount: Number(row.sample_count),
    p75: row.p75 === null ? null : Number(row.p75),
  };
}

export function createPostgresWebVitalsSampleStore(client: SupabaseClient): WebVitalsSampleStore {
  async function percentiles(
    fn: 'web_vitals_p75' | 'web_vitals_p75_overall',
    query: VitalsPercentileQuery,
  ): Promise<readonly VitalsPercentile[]> {
    const { data, error } = await client.rpc(fn, { p_since: query.since });
    if (error) throw new Error(`${fn} failed: ${error.code ?? 'unknown'}`);
    // Cast, not `.returns<T>()`: with no generated types for these functions
    // the builder's generic resolves to a set-returning/single-object
    // mismatch. Same shape as `postgres-outbox-store.ts`'s `claimBatch`.
    return ((data ?? []) as readonly PercentileRow[]).map(toPercentile);
  }

  return {
    async record(sample: VitalsSample) {
      const { error } = await client.from(TABLE).insert({
        metric: sample.metric,
        value: sample.value,
        rating: sample.rating,
        navigation_type: sample.navigationType,
        route_pattern: sample.routePattern,
        locale: sample.locale,
        viewport_bucket: sample.viewportBucket,
        recorded_at: sample.recordedAt,
      });
      // Thrown, not swallowed: `recordVitalsSample` is the layer that decides
      // a telemetry failure must stay invisible to the guest, and it needs to
      // see the failure to log it.
      if (error) throw new Error(`web vitals insert failed: ${error.code ?? 'unknown'}`);
    },

    percentilesByRoute(query) {
      return percentiles('web_vitals_p75', query);
    },

    percentilesOverall(query) {
      return percentiles('web_vitals_p75_overall', query);
    },

    async pruneRecordedBefore(cutoff: string) {
      const { error, count } = await client
        .from(TABLE)
        .delete({ count: 'exact' })
        .lt('recorded_at', cutoff);
      if (error) throw new Error(`web vitals prune failed: ${error.code ?? 'unknown'}`);
      return count ?? 0;
    },
  };
}
