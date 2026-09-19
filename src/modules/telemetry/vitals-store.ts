/**
 * `WebVitalsSampleStore` — the port the telemetry route writes through, plus
 * the in-memory adapter used when Postgres is not configured (this sandbox's
 * unit tests, the Playwright run, and any local `next dev` without Supabase
 * credentials), mirroring the D-023 provider-neutral pattern every other
 * domain in this codebase follows.
 *
 * ## The in-memory percentile is real, not a stub
 *
 * `percentile` here computes the same interpolating P75 the migration's
 * `percentile_cont(0.75)` does, using the linear-interpolation definition
 * Postgres implements. That matters: it means the aggregation logic is
 * unit-testable against known inputs without a live database, and a
 * disagreement between the two implementations is a bug one of them has
 * rather than "the test double is approximate." The in-memory adapter is
 * still dev/test-only for *storage* (a `Map` in one process heap, lost on
 * recycle, invisible to other instances — the same caveat D-085 spelled out
 * for notifications), but nobody has to trust that its arithmetic differs.
 */

import {
  VITALS_METRICS,
  type RoutePattern,
  type VitalsMetric,
  type VitalsPercentile,
  type VitalsSample,
  type ViewportBucket,
} from './vitals-sample';

export interface VitalsPercentileQuery {
  /** Inclusive lower bound on `recordedAt`, as an ISO timestamp. */
  readonly since: string;
}

export interface WebVitalsSampleStore {
  /** Appends one sample. Never updates: a sample is an immutable observation. */
  record(sample: VitalsSample): Promise<void>;
  /** P75 per metric, sliced by route and viewport. */
  percentilesByRoute(query: VitalsPercentileQuery): Promise<readonly VitalsPercentile[]>;
  /** Site-wide P75 per metric — `routePattern`/`viewportBucket` are null on every row. */
  percentilesOverall(query: VitalsPercentileQuery): Promise<readonly VitalsPercentile[]>;
  /** Deletes samples recorded strictly before the cutoff. Returns how many went. */
  pruneRecordedBefore(cutoff: string): Promise<number>;
}

/**
 * Linear-interpolated percentile over a sorted population — the definition
 * `percentile_cont` uses. For `p = 0.75` and `n` samples, the target index
 * is `0.75 * (n - 1)` in zero-based terms; a fractional index interpolates
 * between its neighbours.
 *
 * Exported so the unit tests can assert the arithmetic directly against
 * hand-computed values rather than only through a store.
 */
export function continuousPercentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;

  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

interface GroupKey {
  readonly metric: VitalsMetric;
  readonly routePattern: RoutePattern | null;
  readonly viewportBucket: ViewportBucket | null;
}

function groupPercentiles(
  samples: readonly VitalsSample[],
  keyOf: (sample: VitalsSample) => GroupKey,
): readonly VitalsPercentile[] {
  const groups = new Map<string, { readonly key: GroupKey; readonly values: number[] }>();

  for (const sample of samples) {
    const key = keyOf(sample);
    const id = `${key.metric}|${key.routePattern ?? ''}|${key.viewportBucket ?? ''}`;
    const existing = groups.get(id);
    if (existing) existing.values.push(sample.value);
    else groups.set(id, { key, values: [sample.value] });
  }

  return [...groups.values()]
    .map(({ key, values }) => ({
      metric: key.metric,
      routePattern: key.routePattern,
      viewportBucket: key.viewportBucket,
      sampleCount: values.length,
      p75: continuousPercentile(values, 0.75),
    }))
    .sort(
      (a, b) =>
        VITALS_METRICS.indexOf(a.metric) - VITALS_METRICS.indexOf(b.metric) ||
        (a.routePattern ?? '').localeCompare(b.routePattern ?? '') ||
        (a.viewportBucket ?? '').localeCompare(b.viewportBucket ?? ''),
    );
}

/** Dev/test-only storage — see the module doc comment. `samples` is exposed for assertions. */
export function createInMemoryWebVitalsSampleStore(): WebVitalsSampleStore & {
  readonly samples: readonly VitalsSample[];
} {
  const samples: VitalsSample[] = [];

  const within = (since: string): VitalsSample[] =>
    samples.filter((sample) => sample.recordedAt >= since);

  return {
    get samples(): readonly VitalsSample[] {
      return [...samples];
    },

    record(sample: VitalsSample): Promise<void> {
      samples.push(sample);
      return Promise.resolve();
    },

    percentilesByRoute({ since }: VitalsPercentileQuery): Promise<readonly VitalsPercentile[]> {
      return Promise.resolve(
        groupPercentiles(within(since), (sample) => ({
          metric: sample.metric,
          routePattern: sample.routePattern,
          viewportBucket: sample.viewportBucket,
        })),
      );
    },

    percentilesOverall({ since }: VitalsPercentileQuery): Promise<readonly VitalsPercentile[]> {
      return Promise.resolve(
        groupPercentiles(within(since), (sample) => ({
          metric: sample.metric,
          routePattern: null,
          viewportBucket: null,
        })),
      );
    },

    pruneRecordedBefore(cutoff: string): Promise<number> {
      const keep = samples.filter((sample) => sample.recordedAt >= cutoff);
      const removed = samples.length - keep.length;
      samples.length = 0;
      samples.push(...keep);
      return Promise.resolve(removed);
    },
  };
}
