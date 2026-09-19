/**
 * GET /api/cron/telemetry-retention — prunes Web Vitals samples past their
 * retention window.
 *
 * Same authenticated-job pattern as `/api/cron/consent-retention` (Step 36)
 * and `/api/cron/outbox-dispatch` (Step 25): `Authorization: Bearer
 * $CRON_SECRET`, redacted counts only in the response. Safe to invoke more
 * than once in quick succession — `pruneRecordedBefore` is a ranged delete,
 * so a second run in the same minute simply prunes nothing new.
 *
 * Unlike consent retention, nothing here is a compliance deadline: the rows
 * are anonymous, so a missed run costs storage, not a broken promise. The
 * actual schedule is deployment configuration (the project is on Vercel
 * Hobby, whose cron minimum is once daily — which is ample for a 90-day
 * window, unlike the outbox dispatcher that needed an external scheduler;
 * see `docs/outbox-dispatch-cron.md` for that contrast).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { parseCronSecret } from '../../../../lib/env.server';
import { verifyCronAuthHeader } from '../../../../lib/security/cron-auth';
import { runVitalsRetentionJob } from '../../../../modules/telemetry/retention';
import { webVitalsSampleStore } from '../../../../modules/telemetry/deps';

export async function GET(request: NextRequest) {
  const authorized = verifyCronAuthHeader(request.headers.get('authorization'), parseCronSecret());
  if (!authorized) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'You need to sign in to do that.' } },
      { status: 401 },
    );
  }

  const summary = await runVitalsRetentionJob({ store: webVitalsSampleStore });
  return NextResponse.json(summary);
}
