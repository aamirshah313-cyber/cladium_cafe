/**
 * GET /api/cron/alerting-retention — prunes operational counter buckets
 * past their retention window.
 *
 * Same authenticated-job pattern as the consent and telemetry retention
 * jobs. Nothing here is a compliance deadline: the rows are anonymous
 * counters, so a missed run costs storage rather than a broken promise.
 *
 * `alert_firings` is deliberately **not** pruned. It is the record of what
 * was alerted on and why — small (bounded by the cooldown, not by traffic),
 * and the thing you most want to still have when working out why nobody
 * noticed an incident. Counters are the high-volume half and the only half
 * worth deleting.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { parseCronSecret } from '../../../../lib/env.server';
import { verifyCronAuthHeader } from '../../../../lib/security/cron-auth';
import { alertStore } from '../../../../modules/alerting/deps';
import { OPERATIONAL_COUNTER_RETENTION_DAYS } from '../../../../modules/alerting/operational-event';

export async function GET(request: NextRequest) {
  const authorized = verifyCronAuthHeader(request.headers.get('authorization'), parseCronSecret());
  if (!authorized) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'You need to sign in to do that.' } },
      { status: 401 },
    );
  }

  const ranAt = new Date();
  const cutoff = new Date(
    ranAt.getTime() - OPERATIONAL_COUNTER_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const prunedCount = await alertStore.pruneCountersBefore(cutoff);

  return NextResponse.json({
    prunedCount,
    retentionDays: OPERATIONAL_COUNTER_RETENTION_DAYS,
    ranAt: ranAt.toISOString(),
  });
}
