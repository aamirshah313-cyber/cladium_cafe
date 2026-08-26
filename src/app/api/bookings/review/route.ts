/**
 * POST /api/bookings/review — Runbook Step 22.
 *
 * Builds the review (server-echoed date/time/party-size/seating/contact
 * details — nothing computed, unlike takeaway's totals) and issues the
 * single-use confirmation token `/api/bookings/submit` requires. No cart
 * equivalent exists for a booking, so this calls
 * `modules/bookings/submission-service.ts` directly rather than going
 * through a `modules/bookings/http.ts` orchestration layer.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import { bookingDeps } from '../../../../modules/bookings/deps';
import { bookingReviewBodySchema } from '../../../../modules/bookings/schemas';
import { prepareBookingRequest } from '../../../../modules/bookings/submission-service';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, bookingReviewBodySchema);
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, body } = result.value;
  const reviewResult = await prepareBookingRequest(bookingDeps, {
    sessionId,
    guestName: body.guestName,
    guestPhone: body.guestPhone,
    requestedDate: body.requestedDate,
    requestedTime: body.requestedTime,
    partySize: body.partySize,
    seatingPreference: body.seatingPreference,
    notes: body.notes,
  });
  return respondResult(reviewResult, { setCookieHeader });
}
