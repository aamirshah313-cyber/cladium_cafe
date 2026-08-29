/**
 * POST /api/takeaway/review — Runbook Step 20.
 *
 * Builds the bilingual final review (server-computed totals, contact/
 * pickup details) and issues the single-use confirmation token the guest
 * must present, unchanged, to `/api/takeaway/submit`. Rejects an empty
 * cart and a session with no cart at all (`modules/takeaway/http.ts`).
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import {
  guestRouteRateLimiter,
  REQUEST_REVIEW_RATE_LIMIT_RULE,
} from '../../../../lib/http/route-rate-limits';
import { reviewTakeaway } from '../../../../modules/takeaway/http';
import { takeawayDeps } from '../../../../modules/takeaway/deps';
import { reviewBodySchema } from '../../../../modules/takeaway/schemas';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, reviewBodySchema, {
    rateLimit: {
      limiter: guestRouteRateLimiter,
      rule: REQUEST_REVIEW_RATE_LIMIT_RULE,
      keyPrefix: 'req-review',
    },
  });
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, body } = result.value;
  const reviewResult = await reviewTakeaway(takeawayDeps, sessionId, {
    guestName: body.guestName,
    guestPhone: body.guestPhone,
    requestedCollectionNote: body.requestedCollectionNote,
    notes: body.notes,
  });
  return respondResult(reviewResult, { setCookieHeader });
}
