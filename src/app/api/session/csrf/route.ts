/**
 * GET /api/session/csrf — Runbook Step 22.
 *
 * A shared bootstrap for any client-rendered mutating form that has no
 * GET-with-data endpoint of its own to piggyback a CSRF token on (the
 * takeaway cart already returns its token from `GET /api/takeaway/cart`;
 * booking/event forms have no equivalent "current state" to fetch, so they
 * call this instead). Read-only: mints a guest session cookie on first
 * visit if none exists yet, same as any other session-resolving GET.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { resolveSessionContext } from '../../../../lib/http/session-route';
import { ok } from '../../../../lib/result';

export async function GET(request: NextRequest) {
  const sessionResult = resolveSessionContext({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
  });
  if (!sessionResult.ok) return respondResult(sessionResult);

  const { csrfToken, setCookieHeader } = sessionResult.value;
  return respondResult(ok({ csrfToken }), { setCookieHeader });
}
