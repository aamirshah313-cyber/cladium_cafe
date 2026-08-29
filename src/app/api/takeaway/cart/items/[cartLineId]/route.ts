/**
 * PATCH/DELETE /api/takeaway/cart/items/[cartLineId] — Runbook Step 20.
 *
 * Modifies the quantity of, or removes, one line in the caller's own
 * session-owned cart. `cartLineId` comes from the URL, not the body — it
 * only ever resolves against the caller's own cart (`modules/takeaway/http.ts`),
 * so a guessed/foreign line ID fails `NOT_FOUND`, not a cross-session read.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../../../lib/http/mutating-route';
import {
  guestRouteRateLimiter,
  CART_MUTATION_RATE_LIMIT_RULE,
} from '../../../../../../lib/http/route-rate-limits';
import { modifyItem, removeItem } from '../../../../../../modules/takeaway/http';
import { takeawayDeps } from '../../../../../../modules/takeaway/deps';
import {
  modifyItemBodySchema,
  removeItemBodySchema,
} from '../../../../../../modules/takeaway/schemas';

interface RouteParams {
  readonly params: Promise<{ cartLineId: string }>;
}

const cartLineRateLimit = {
  limiter: guestRouteRateLimiter,
  rule: CART_MUTATION_RATE_LIMIT_RULE,
  keyPrefix: 'cart-item',
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { cartLineId } = await params;
  const { result, setCookieHeader } = await parseMutatingRequest(request, modifyItemBodySchema, {
    rateLimit: cartLineRateLimit,
  });
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, body } = result.value;
  const modifyResult = await modifyItem(takeawayDeps, sessionId, {
    cartLineId,
    quantity: body.quantity,
  });
  return respondResult(modifyResult, { setCookieHeader });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { cartLineId } = await params;
  const { result, setCookieHeader } = await parseMutatingRequest(request, removeItemBodySchema, {
    rateLimit: cartLineRateLimit,
  });
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId } = result.value;
  const removeResult = await removeItem(takeawayDeps, sessionId, cartLineId);
  return respondResult(removeResult, { setCookieHeader });
}
