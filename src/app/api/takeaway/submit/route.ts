/**
 * POST /api/takeaway/submit — Runbook Step 20.
 *
 * The customer-facing half of data-model-v2.md §7's "Submit takeaway
 * request" transaction contract (`modules/takeaway/submission-service.ts`
 * implements the rest): consumes the single-use confirmation token from
 * `/api/takeaway/review`, verified against a *freshly recomputed* review —
 * a changed price or an expired/reused token fails here, not silently.
 * Clears the cart only on success (`modules/takeaway/http.ts`).
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import { submitTakeaway } from '../../../../modules/takeaway/http';
import { takeawayDeps } from '../../../../modules/takeaway/deps';
import { submitBodySchema } from '../../../../modules/takeaway/schemas';
import { metaEventsDeps } from '../../../../modules/integrations/meta-deps';
import { trackMetaEvent } from '../../../../modules/integrations/meta-events';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, submitBodySchema);
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, correlationId, body } = result.value;
  const submitResult = await submitTakeaway(takeawayDeps, sessionId, {
    guestName: body.guestName,
    guestPhone: body.guestPhone,
    requestedCollectionNote: body.requestedCollectionNote,
    notes: body.notes,
    sourceChannel: body.sourceChannel,
    confirmationToken: body.confirmationToken,
    idempotencyKey: body.idempotencyKey,
    correlationId,
  });
  // Step 37: "submit_order_request" (production-architecture-v2.md §11) —
  // never "purchase", since this is only a request, not a completed sale.
  if (submitResult.ok) {
    await trackMetaEvent(metaEventsDeps, {
      eventName: 'submit_order_request',
      sessionId,
      correlationId,
    });
  }
  return respondResult(submitResult, { setCookieHeader });
}
