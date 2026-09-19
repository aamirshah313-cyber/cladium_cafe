/**
 * Web Vitals sample retention job — the same shape as
 * `modules/consent/retention.ts`, deliberately: one job function that is
 * the only caller of its store's delete, invoked by one authenticated cron
 * route.
 *
 * Why this exists at all: a sample is written on every page load of every
 * visit, which is by far the highest-volume insert in this schema, and the
 * current Supabase plan is the free one. Unbounded growth would eventually
 * be someone's incident. `VITALS_SAMPLE_RETENTION_DAYS` is an operational
 * storage choice rather than a compliance commitment — the rows are
 * anonymous (see the migration header), so unlike consent events this
 * window may be shortened or lengthened without owner/legal review.
 */

import { VITALS_SAMPLE_RETENTION_DAYS } from './vitals-sample';
import type { WebVitalsSampleStore } from './vitals-store';

export interface RunVitalsRetentionJobDeps {
  readonly store: WebVitalsSampleStore;
  readonly retentionDays?: number;
  readonly now?: () => Date;
}

export interface VitalsRetentionJobSummary {
  readonly prunedCount: number;
  readonly retentionDays: number;
  readonly ranAt: string;
}

export async function runVitalsRetentionJob(
  deps: RunVitalsRetentionJobDeps,
): Promise<VitalsRetentionJobSummary> {
  const now = deps.now ?? (() => new Date());
  const retentionDays = deps.retentionDays ?? VITALS_SAMPLE_RETENTION_DAYS;
  const nowInstant = now();
  const cutoff = new Date(nowInstant.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  const prunedCount = await deps.store.pruneRecordedBefore(cutoff.toISOString());

  return { prunedCount, retentionDays, ranAt: nowInstant.toISOString() };
}
