/** GET /api/staff/events/[id] — Runbook Step 24. Detail view: record plus append-only status history. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../lib/http/respond';
import { resolveStaffActor } from '../../../../../lib/http/staff-session-route';
import { correlationIdFrom } from '../../../../../lib/correlation';
import { staffDirectory } from '../../../../../modules/staff/deps';
import { eventDeps } from '../../../../../modules/events/deps';
import { getEventRequestDetail } from '../../../../../modules/events/staff-service';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const correlationId = correlationIdFrom(request.headers);
  const actorResult = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId,
  });
  if (!actorResult.ok) return respondResult(actorResult);

  const { id } = await context.params;
  const result = await getEventRequestDetail(eventDeps, actorResult.value.actor, id, correlationId);
  return respondResult(result);
}
