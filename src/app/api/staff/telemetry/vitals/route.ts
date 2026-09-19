/**
 * GET /api/staff/telemetry/vitals — the read side of field telemetry.
 *
 * Without this, samples would accumulate in a table nobody can query:
 * `web_vitals_samples` exposes no rows through RLS by design (see migration
 * `20260919120000`), so the aggregate functions reached through here are the
 * table's only read interface.
 *
 * Staff-authenticated, and readable by any signed-in staff member — the same
 * across-roles posture `/api/staff/notifications` uses, for the same reason:
 * site performance is not entity-scoped, and there is nothing role-sensitive
 * in an anonymous percentile.
 *
 * `?days=` selects the window (default 28, the span Core Web Vitals field
 * tooling conventionally reports over, and long enough that a P75 is not
 * dominated by one busy evening). Every response states `sampleCount` and
 * `meaningful` per row: a P75 over a handful of page loads is not a field
 * measurement, and an operator must be able to see that at a glance rather
 * than quoting a number Step 41 already took care not to overstate.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../lib/http/respond';
import { resolveStaffActor } from '../../../../../lib/http/staff-session-route';
import { correlationIdFrom } from '../../../../../lib/correlation';
import { err, ok } from '../../../../../lib/result';
import { validationFailed } from '../../../../../lib/errors';
import { staffDirectory } from '../../../../../modules/staff/deps';
import { webVitalsSampleStore } from '../../../../../modules/telemetry/deps';
import {
  isMeaningfulSampleCount,
  MIN_MEANINGFUL_SAMPLE_COUNT,
  VITALS_SAMPLE_RETENTION_DAYS,
  type VitalsPercentile,
} from '../../../../../modules/telemetry/vitals-sample';

const DEFAULT_WINDOW_DAYS = 28;

function withMeaningfulness(rows: readonly VitalsPercentile[]) {
  return rows.map((row) => ({ ...row, meaningful: isMeaningfulSampleCount(row.sampleCount) }));
}

export async function GET(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);

  const actorResult = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId,
  });
  if (!actorResult.ok) return respondResult(actorResult);

  const rawDays = request.nextUrl.searchParams.get('days');
  const days = rawDays === null ? DEFAULT_WINDOW_DAYS : Number(rawDays);
  // Capped at the retention window: a longer range would silently describe a
  // shorter one, since nothing older than that exists to be included.
  if (!Number.isInteger(days) || days < 1 || days > VITALS_SAMPLE_RETENTION_DAYS) {
    return respondResult(
      err(validationFailed([{ path: 'days', code: 'out_of_range' }], correlationId)),
    );
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const [overall, byRoute] = await Promise.all([
    webVitalsSampleStore.percentilesOverall({ since }),
    webVitalsSampleStore.percentilesByRoute({ since }),
  ]);

  return respondResult(
    ok({
      since,
      windowDays: days,
      minMeaningfulSampleCount: MIN_MEANINGFUL_SAMPLE_COUNT,
      overall: withMeaningfulness(overall),
      byRoute: withMeaningfulness(byRoute),
    }),
  );
}
