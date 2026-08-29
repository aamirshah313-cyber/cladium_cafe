/**
 * POST /api/meta/track — Runbook Step 37.
 *
 * The client-triggered half of Meta event tracking (`view_menu`, `contact`)
 * — server-side-triggered events (`add_to_cart`, `submit_*_request`) call
 * `trackMetaEvent` directly from their own routes instead, since those
 * already run server-side at the moment the event actually happens. Every
 * caller — this route included — goes through the exact same
 * `trackMetaEvent` decision point (`modules/integrations/meta-events.ts`),
 * never a second consent/flag check.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import {
  guestRouteRateLimiter,
  META_TRACK_RATE_LIMIT_RULE,
} from '../../../../lib/http/route-rate-limits';
import { ok } from '../../../../lib/result';
import { metaEventsDeps } from '../../../../modules/integrations/meta-deps';
import { trackMetaEvent } from '../../../../modules/integrations/meta-events';
import { trackMetaEventBodySchema } from '../../../../modules/integrations/meta-schemas';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(
    request,
    trackMetaEventBodySchema,
    {
      rateLimit: {
        limiter: guestRouteRateLimiter,
        rule: META_TRACK_RATE_LIMIT_RULE,
        keyPrefix: 'meta-track',
      },
    },
  );
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, correlationId, body } = result.value;
  const trackResult = await trackMetaEvent(metaEventsDeps, {
    eventName: body.eventName,
    sessionId,
    eventSourceUrl: body.eventSourceUrl,
    correlationId,
  });
  return respondResult(ok(trackResult), { setCookieHeader });
}
