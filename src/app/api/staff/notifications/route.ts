/**
 * GET /api/staff/notifications — Runbook Step 25.
 *
 * Every signed-in staff member may read this — a new takeaway/booking/event
 * request is relevant across roles, unlike a transition/assign action which
 * is entity-scoped. Payload is already the safe, minimal projection
 * `submission-service.ts`/`staff-transition.ts` built it as (never raw
 * guest contact details or notes).
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { resolveStaffActor } from '../../../../lib/http/staff-session-route';
import { correlationIdFrom } from '../../../../lib/correlation';
import { ok } from '../../../../lib/result';
import { staffDirectory, staffNotifications } from '../../../../modules/staff/deps';

export async function GET(request: NextRequest) {
  const actorResult = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId: correlationIdFrom(request.headers),
  });
  if (!actorResult.ok) return respondResult(actorResult);

  const notifications = await staffNotifications.list();
  return respondResult(ok({ notifications }));
}
