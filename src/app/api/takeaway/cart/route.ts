/**
 * GET /api/takeaway/cart — Runbook Step 20.
 *
 * Read-only: no CSRF/origin guard (GET must never mutate state in the
 * first place — `guardStateChangingRequest` is a no-op for it anyway).
 * Mints a guest session cookie on first visit if none exists yet, and
 * returns the CSRF token the client must echo back on any cart mutation.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { resolveSessionContext } from '../../../../lib/http/session-route';
import { takeawayDeps } from '../../../../modules/takeaway/deps';
import { getCart } from '../../../../modules/takeaway/http';

export async function GET(request: NextRequest) {
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
