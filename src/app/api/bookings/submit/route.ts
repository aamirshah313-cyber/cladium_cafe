/**
 * POST /api/bookings/submit — Runbook Step 22.
 *
 * Consumes the single-use confirmation token from `/api/bookings/review`,
 * verified against a freshly rebuilt review — a changed field or an
 * expired/reused token fails here, not silently. Creates the booking
 * request in `REQUESTED` — never `CONFIRMED`; "a requested time is not
 * availability" (data-model-v2.md §5), and only staff can confirm.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import { bookingDeps } from '../../../../modules/bookings/deps';
import { bookingSubmitBodySchema } from '../../../../modules/bookings/schemas';
import { submitBookingRequest } from '../../../../modules/bookings/submission-service';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, bookingSubmitBodySchema);
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, correlationId, body } = result.value;
  const submitResult = await submitBookingRequest(bookingDeps, {
    sessionId,
    guestName: body.guestName,
    guestPhone: body.guestPhone,
    requestedDate: body.requestedDate,
    requestedTime: body.requestedTime,
    partySize: body.partySize,
    seatingPreference: body.seatingPreference,
    notes: body.notes,
    sourceChannel: body.sourceChannel,
    confirmationToken: body.confirmationToken,
    idempotencyKey: body.idempotencyKey,
    correlationId,
  });
  return respondResult(submitResult, { setCookieHeader });
}
