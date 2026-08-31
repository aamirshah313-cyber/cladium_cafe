/**
 * GET /api/takeaway/cart — Runbook Step 20.
 *
 * Read-only: no CSRF/origin guard (GET must never mutate state in the
 * first place — `guardStateChangingRequest` is a no-op for it anyway).
 * Mints a guest session cookie on first visit if none exists yet, and
 * returns the CSRF token the client must echo back on any cart mutation.
 *
 * Step 45 (D-051): checked before session resolution, same "a disabled
 * feature must not confirm it exists" reasoning `mutating-route.ts`'s
 * own feature-flag check uses — this is the one takeaway route that
 * isn't a `parseMutatingRequest` call, so it checks directly.
 *
 * `dynamic = 'force-dynamic'` (D-051 follow-up): this is the only `GET`
 * route handler in the codebase whose first branch can return without
 * ever reading a cookie/header via `next/headers`-tracked APIs — every
 * other route reaches that immediately. Left implicit, Next.js can treat
 * a route shaped like that as statically renderable and bake its output
 * in at *build time*, exactly the "frozen until a genuinely fresh
 * rebuild" trap `NEXT_PUBLIC_APP_URL` hit in Step 43, just applied to a
 * route handler's output instead of a client-bundle constant. Forcing
 * dynamic rendering removes this route from that trap entirely — it
 * always executes fresh, per request, like every other route already
 * does implicitly.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { err } from '../../../../lib/result';
import { featureDisabled } from '../../../../lib/errors';
import { correlationIdFrom } from '../../../../lib/correlation';
import { isFeatureEnabled } from '../../../../lib/env.server';
import { resolveSessionContext } from '../../../../lib/http/session-route';
import { takeawayDeps } from '../../../../modules/takeaway/deps';
import { getCart } from '../../../../modules/takeaway/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled('FEATURE_TAKEAWAY_REQUESTS')) {
    return respondResult(err(featureDisabled(correlationIdFrom(request.headers))));
  }

  const sessionResult = resolveSessionContext({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
  });
  if (!sessionResult.ok) return respondResult(sessionResult);

  const { sessionId, csrfToken, setCookieHeader } = sessionResult.value;
  const cartResult = await getCart(takeawayDeps, sessionId);
  const withCsrf = cartResult.ok
    ? { ok: true as const, value: { ...cartResult.value, csrfToken } }
    : cartResult;

  return respondResult(withCsrf, { setCookieHeader });
}
