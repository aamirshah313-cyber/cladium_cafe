/**
 * Consent-event retention/deletion job — Runbook Step 36's own evidence
 * bullet ("deletion/retention job... tests pass").
 *
 * `runConsentRetentionJob` is deliberately the only caller of `ConsentEventStore
 * #purgeExpiredBefore` in this codebase — no other code path may remove a
 * consent event. In the real Postgres schema this maps to the one
 * SECURITY DEFINER exception, `purge_expired_consent_events`, added by
 * migration `20260829150001_consent_retention.sql`; the real adapter's
 * version of `purgeExpiredBefore` calls that function directly rather than
 * running a raw `DELETE`. `CONSENT_EVENT_RETENTION_DAYS` (`policy.ts`) is a
 * conservative placeholder pending the owner-approved retention schedule
 * `release-gates-v2.md` Gate 0 requires — safe to shorten, not to lengthen,
 * without that review.
 */

import type { ConsentEventStore } from './consent-store';
import { CONSENT_EVENT_RETENTION_DAYS } from './policy';

export interface RunConsentRetentionJobDeps {
  readonly store: ConsentEventStore;
  readonly retentionDays?: number;
  readonly now?: () => Date;
}

export interface ConsentRetentionJobSummary {
  readonly purgedCount: number;
  readonly retentionDays: number;
  readonly ranAt: string;
}

export async function runConsentRetentionJob(
  deps: RunConsentRetentionJobDeps,
): Promise<ConsentRetentionJobSummary> {
  const now = deps.now ?? (() => new Date());
  const retentionDays = deps.retentionDays ?? CONSENT_EVENT_RETENTION_DAYS;
  const nowInstant = now();
  const cutoff = new Date(nowInstant.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  const purgedCount = await deps.store.purgeExpiredBefore(cutoff);

  return { purgedCount, retentionDays, ranAt: nowInstant.toISOString() };
}
