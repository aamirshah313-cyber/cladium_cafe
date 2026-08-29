/**
 * GET /api/cron/consent-retention — Runbook Step 36.
 *
 * Same authenticated-job pattern as `/api/cron/outbox-dispatch` (Step 25):
 * `Authorization: Bearer $CRON_SECRET`, redacted counts only in the
 * response — never event payloads or session ids. Safe to invoke more
 * than once in quick succession; `purgeExpiredBefore` is a plain filter
 * over the current in-memory list, idempotent by construction (a second
 * run simply purges nothing new). Vercel Cron schedule config is a
 * deployment-step concern (Step 46), not built here — same note as the
 * outbox dispatcher's own route doc comment.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { parseCronSecret } from '../../../../lib/env.server';
import { verifyCronAuthHeader } from '../../../../lib/security/cron-auth';
import { runConsentRetentionJob } from '../../../../modules/consent/retention';
import { consentStore } from '../../../../modules/consent/deps';

export async function GET(request: NextRequest) {
  const authorized = verifyCronAuthHeader(request.headers.get('authorization'), parseCronSecret());
  if (!authorized) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'You need to sign in to do that.' } },
      { status: 401 },
    );
  }

  const summary = await runConsentRetentionJob({ store: consentStore });
  return NextResponse.json(summary);
}
