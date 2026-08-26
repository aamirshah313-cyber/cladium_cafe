/**
 * GET /api/cron/outbox-dispatch — Runbook Step 25.
 *
 * Runs one bounded dispatch cycle (claim → handle → deliver/retry/terminal)
 * and returns redacted counts only — never event payloads, never guest
 * data — for telemetry. `deployment-target.md` names `GET` with
 * `Authorization: Bearer $CRON_SECRET` as the authenticated-job pattern,
 * matching Vercel Cron's own convention. Intended to be invoked on a
 * schedule (Vercel Cron config is a deployment-step concern, not built
 * here); safe to invoke more than once concurrently or in quick succession
 * — `runDispatchCycle`'s atomic claim is what makes overlapping invocations
 * safe, not this route.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { parseCronSecret } from '../../../../lib/env.server';
import { verifyCronAuthHeader } from '../../../../lib/security/cron-auth';
import { runDispatchCycle } from '../../../../lib/domain/outbox-dispatcher';
import { handlersByDestination, outboxStore } from '../../../../modules/notifications/deps';

export async function GET(request: NextRequest) {
  const authorized = verifyCronAuthHeader(request.headers.get('authorization'), parseCronSecret());
  if (!authorized) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'You need to sign in to do that.' } },
      { status: 401 },
    );
  }

  const summary = await runDispatchCycle({ store: outboxStore, handlers: handlersByDestination });
  return NextResponse.json(summary);
}
