/**
 * GET /api/staff/bookings — Runbook Step 24. Same shape as
 * `app/api/staff/takeaway/route.ts`.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { resolveStaffActor } from '../../../../lib/http/staff-session-route';
import { correlationIdFrom } from '../../../../lib/correlation';
import { staffDirectory } from '../../../../modules/staff/deps';
import { bookingDeps } from '../../../../modules/bookings/deps';
import { listBookingRequests } from '../../../../modules/bookings/staff-service';
import type { BookingState } from '../../../../modules/bookings/state-machine';

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
    BookingState | undefined;
  const search = request.nextUrl.searchParams.get('search') ?? undefined;

  const result = await listBookingRequests(
    bookingDeps,
    actorResult.value.actor,
    { state, search },
    correlationId,
  );
  return respondResult(result);
}
