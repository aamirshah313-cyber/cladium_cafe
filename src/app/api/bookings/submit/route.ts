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
import {
  guestRouteRateLimiter,
  REQUEST_SUBMIT_RATE_LIMIT_RULE,
} from '../../../../lib/http/route-rate-limits';
import { bookingDeps } from '../../../../modules/bookings/deps';
import { bookingSubmitBodySchema } from '../../../../modules/bookings/schemas';
import { submitBookingRequest } from '../../../../modules/bookings/submission-service';
import { metaEventsDeps } from '../../../../modules/integrations/meta-deps';
import { trackMetaEvent } from '../../../../modules/integrations/meta-events';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, bookingSubmitBodySchema, {
    featureFlag: 'FEATURE_BOOKING_REQUESTS',
    rateLimit: {
      limiter: guestRouteRateLimiter,
      rule: REQUEST_SUBMIT_RATE_LIMIT_RULE,
      keyPrefix: 'req-submit',
    },
  });
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
  // Step 37: "submit_booking_request" — never "booking_confirmed"; a
  // requested time is not availability (data-model-v2.md §5).
  if (submitResult.ok) {
    await trackMetaEvent(metaEventsDeps, {
      eventName: 'submit_booking_request',
      sessionId,
      correlationId,
    });
  }
  return respondResult(submitResult, { setCookieHeader });
}
