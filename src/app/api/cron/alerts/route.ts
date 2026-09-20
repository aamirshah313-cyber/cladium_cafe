/**
 * GET /api/cron/alerts — evaluates every threshold and notifies staff about
 * anything that fires. Item 8 of Step 45's punch list (D-049).
 *
 * Same authenticated-job pattern as `/api/cron/outbox-dispatch` and the two
 * retention jobs: `Authorization: Bearer $CRON_SECRET`, redacted counts only
 * in the response — the fired keys, never the evidence, which lives in
 * `alert_firings`.
 *
 * Safe to invoke repeatedly. The cooldown in `thresholds.ts` means a
 * condition that persists across runs notifies once per cooldown window
 * rather than once per invocation, so an over-eager schedule costs queries,
 * not noise.
 *
 * ## Cadence matters more here than for the retention jobs
 *
 * An alert is only as timely as its evaluation. The shortest threshold
 * window is 5 minutes, so evaluating less often than that means a
 * rate-limit incident can open and close entirely between two runs and
 * never be seen. Vercel Hobby's cron minimum is **once daily**, which is
 * useless for this — so, exactly like the outbox dispatcher (D-085), this
 * needs an external scheduler calling it every few minutes until the plan
 * changes. `docs/alerting.md` records that plainly, because an alerting
 * system believed to be running when it is not is worse than none.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { parseCronSecret } from '../../../../lib/env.server';
import { verifyCronAuthHeader } from '../../../../lib/security/cron-auth';
import { createLogger } from '../../../../lib/logging';
import { correlationIdFrom } from '../../../../lib/correlation';
import { runAlertEvaluation } from '../../../../modules/alerting/run-alert-evaluation';
import { alertStore } from '../../../../modules/alerting/deps';
import { outboxDispatchTotalsSince } from '../../../../modules/alerting/outbox-totals';
import { outboxStore } from '../../../../modules/notifications/deps';

export async function GET(request: NextRequest) {
  const authorized = verifyCronAuthHeader(request.headers.get('authorization'), parseCronSecret());
  if (!authorized) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'You need to sign in to do that.' } },
      { status: 401 },
    );
  }

  const correlationId = correlationIdFrom(request.headers);
  const summary = await runAlertEvaluation({
    store: alertStore,
    outbox: outboxStore,
    outboxTotalsSince: outboxDispatchTotalsSince,
    logger: createLogger({ correlationId }),
    generateId: randomUUID,
  });

  return NextResponse.json(summary);
}
