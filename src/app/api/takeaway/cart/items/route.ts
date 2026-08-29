/**
 * POST /api/takeaway/cart/items — Runbook Step 20.
 *
 * Adds an item (and optional variant) to the caller's own session-owned
 * cart. `parseMutatingRequest` (`lib/http/mutating-route.ts`) owns the
 * content-type/size/session/CSRF boilerplate; cross-session access isn't
 * reachable here at all (see `modules/takeaway/http.ts`'s doc comment).
 *
 * Step 37: fires the `add_to_cart` Meta event on a successful add, through
 * the one shared consent/flag-gated `trackMetaEvent` decision point — a
 * failed add never reaches this call, and `trackMetaEvent` itself never
 * throws, so this can never turn a successful cart mutation into an error
 * response.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../../lib/http/mutating-route';
import { addItem } from '../../../../../modules/takeaway/http';
import { takeawayDeps } from '../../../../../modules/takeaway/deps';
import { addItemBodySchema } from '../../../../../modules/takeaway/schemas';
import { metaEventsDeps } from '../../../../../modules/integrations/meta-deps';
import { trackMetaEvent } from '../../../../../modules/integrations/meta-events';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, addItemBodySchema);
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, correlationId, body } = result.value;
  const addResult = await addItem(takeawayDeps, sessionId, {
    menuItemId: body.menuItemId,
    variantId: body.variantId,
    quantity: body.quantity,
  });
  if (addResult.ok) {
    await trackMetaEvent(metaEventsDeps, {
      eventName: 'add_to_cart',
      sessionId,
      correlationId,
    });
  }
  return respondResult(addResult, { setCookieHeader });
}
