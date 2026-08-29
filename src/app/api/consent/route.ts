/**
 * GET/POST /api/consent — Runbook Step 36.
 *
 * GET is read-only (session-authenticated, no CSRF needed), same shape as
 * `GET /api/vapi/pending-confirmation` (Step 33): mints a session cookie
 * on first visit if none exists, returns the full per-category snapshot
 * plus the CSRF token needed for the next grant/revoke. POST reuses Step
 * 20's `parseMutatingRequest` boilerplate unchanged and records exactly
 * one category's grant/revoke, then returns the updated snapshot so the
 * caller never needs a second round-trip.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../lib/http/respond';
import { resolveSessionContext } from '../../../lib/http/session-route';
import { parseMutatingRequest } from '../../../lib/http/mutating-route';
import { correlationIdFrom } from '../../../lib/correlation';
import { ok } from '../../../lib/result';
import { consentDeps } from '../../../modules/consent/deps';
import { getConsentSnapshot, recordConsent } from '../../../modules/consent/consent-service';
import { recordConsentBodySchema } from '../../../modules/consent/schemas';

export async function GET(request: NextRequest) {
  const sessionResult = resolveSessionContext({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
  });
  if (!sessionResult.ok) return respondResult(sessionResult);

  const { sessionId, csrfToken, setCookieHeader } = sessionResult.value;
  const consent = await getConsentSnapshot(consentDeps, sessionId);
  return respondResult(ok({ consent, csrfToken }), { setCookieHeader });
}

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(request, recordConsentBodySchema);
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, body } = result.value;
  await recordConsent(consentDeps, {
    sessionId,
    category: body.category,
    granted: body.granted,
    source: body.source,
    correlationId: correlationIdFrom(request.headers),
  });
  const consent = await getConsentSnapshot(consentDeps, sessionId);
  return respondResult(ok({ consent }), { setCookieHeader });
}
