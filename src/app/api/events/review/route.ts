/**
 * POST /api/events/review — Runbook Step 23.
 *
 * Builds the review (server-echoed occasion/date/time/guest-count/décor-
 * interest/contact details — nothing computed, priced, or quoted) and
 * issues the single-use confirmation token `/api/events/submit` requires.
 * No cart equivalent exists for an event enquiry, so this calls
 * `modules/events/submission-service.ts` directly, same as
 * `app/api/bookings/review/route.ts`.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import {
  guestRouteRateLimiter,
  REQUEST_REVIEW_RATE_LIMIT_RULE,
} from '../../../../lib/http/route-rate-limits';
import { eventDeps } from '../../../../modules/events/deps';
import { eventReviewBodySchema } from '../../../../modules/events/schemas';
import { prepareEventRequest } from '../../../../modules/events/submission-service';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, eventReviewBodySchema, {
    featureFlag: 'FEATURE_EVENT_REQUESTS',
    rateLimit: {
      limiter: guestRouteRateLimiter,
      rule: REQUEST_REVIEW_RATE_LIMIT_RULE,
      keyPrefix: 'req-review',
    },
  });
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, body } = result.value;
  const reviewResult = await prepareEventRequest(eventDeps, {
    sessionId,
    guestName: body.guestName,
    guestPhone: body.guestPhone,
    occasion: body.occasion,
    requestedDate: body.requestedDate,
    requestedTime: body.requestedTime,
    guestCount: body.guestCount,
    decorInterest: body.decorInterest,
    notes: body.notes,
  });
  return respondResult(reviewResult, { setCookieHeader });
}
