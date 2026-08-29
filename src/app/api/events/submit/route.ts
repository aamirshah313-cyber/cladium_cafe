/**
 * POST /api/events/submit — Runbook Step 23.
 *
 * Consumes the single-use confirmation token from `/api/events/review`,
 * verified against a freshly rebuilt review — a changed field or an
 * expired/reused token fails here, not silently. Creates the event request
 * in `REQUESTED` with `quotedAmountPkr: null` — never a quote or
 * confirmation; only a staff `QUOTED`/`CONFIRMED` transition can set those
 * (`modules/events/state-machine.ts`).
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import {
  guestRouteRateLimiter,
  REQUEST_SUBMIT_RATE_LIMIT_RULE,
} from '../../../../lib/http/route-rate-limits';
import { eventDeps } from '../../../../modules/events/deps';
import { eventSubmitBodySchema } from '../../../../modules/events/schemas';
import { submitEventRequest } from '../../../../modules/events/submission-service';
import { metaEventsDeps } from '../../../../modules/integrations/meta-deps';
import { trackMetaEvent } from '../../../../modules/integrations/meta-events';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, eventSubmitBodySchema, {
    rateLimit: {
      limiter: guestRouteRateLimiter,
      rule: REQUEST_SUBMIT_RATE_LIMIT_RULE,
      keyPrefix: 'req-submit',
    },
  });
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, correlationId, body } = result.value;
  const submitResult = await submitEventRequest(eventDeps, {
    sessionId,
    guestName: body.guestName,
    guestPhone: body.guestPhone,
    occasion: body.occasion,
    requestedDate: body.requestedDate,
    requestedTime: body.requestedTime,
    guestCount: body.guestCount,
    decorInterest: body.decorInterest,
    notes: body.notes,
    sourceChannel: body.sourceChannel,
    confirmationToken: body.confirmationToken,
    idempotencyKey: body.idempotencyKey,
    correlationId,
  });
  // Step 37: "submit_event_request" — never a quote or confirmation; only
  // a staff QUOTED/CONFIRMED transition sets those (state-machine.ts).
  if (submitResult.ok) {
    await trackMetaEvent(metaEventsDeps, {
      eventName: 'submit_event_request',
      sessionId,
      correlationId,
    });
  }
  return respondResult(submitResult, { setCookieHeader });
}
