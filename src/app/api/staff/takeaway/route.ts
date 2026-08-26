/**
 * GET /api/staff/takeaway — Runbook Step 24. Role-scoped queue list with
 * optional `state`/`search` query params ("safe search/filtering" — see
 * `modules/staff/filter.ts`).
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { resolveStaffActor } from '../../../../lib/http/staff-session-route';
import { correlationIdFrom } from '../../../../lib/correlation';
import { staffDirectory } from '../../../../modules/staff/deps';
import { takeawayDeps } from '../../../../modules/takeaway/deps';
import { listTakeawayRequests } from '../../../../modules/takeaway/staff-service';
import type { TakeawayState } from '../../../../modules/takeaway/state-machine';

export async function GET(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);
  const actorResult = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId,
  });
  if (!actorResult.ok) return respondResult(actorResult);

  const state = (request.nextUrl.searchParams.get('state') ?? undefined) as
    TakeawayState | undefined;
  const search = request.nextUrl.searchParams.get('search') ?? undefined;

  const result = await listTakeawayRequests(
    takeawayDeps,
    actorResult.value.actor,
    { state, search },
    correlationId,
  );
  return respondResult(result);
}
