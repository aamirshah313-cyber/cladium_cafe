/**
 * POST /api/vapi/token — Runbook Step 31.
 *
 * Session/CSRF/origin-guarded exactly like every other guest-mutating
 * route since Step 20 (`parseMutatingRequest`) — CSRF matters here even
 * though nothing is written to a domain record: this mints a real
 * (short-lived, restricted) credential bound to the caller's session, and a
 * forged cross-site POST minting one against a victim's rate-limit budget
 * is exactly the class of request CSRF protection exists to block.
 *
 * The restricted origin embedded in the issued token is always this
 * server's own configured `NEXT_PUBLIC_APP_URL` (`parseAppUrl()`), never
 * the request's raw `Origin` header — defense in depth, even though that
 * header was already checked against the same value by the guard above.
 */

import type { NextRequest } from 'next/server';
import { parseAppUrl } from '../../../../lib/env';
import { err } from '../../../../lib/result';
import { internalError } from '../../../../lib/errors';
import { respondResult } from '../../../../lib/http/respond';
import { parseMutatingRequest } from '../../../../lib/http/mutating-route';
import { voiceTokenDeps } from '../../../../modules/voice/deps';
import { vapiTokenRequestBodySchema } from '../../../../modules/voice/schemas';
import { issueVapiToken } from '../../../../modules/voice/token/issue-vapi-token';

export async function POST(request: NextRequest) {
  const { result, setCookieHeader } = await parseMutatingRequest(
    request,
    vapiTokenRequestBodySchema,
  );
  if (!result.ok) return respondResult(result, { setCookieHeader });

  const { sessionId, correlationId, body } = result.value;

  // `guardStateChangingRequest` (inside `parseMutatingRequest`) already
  // parsed `NEXT_PUBLIC_APP_URL` successfully to reach this point, so this
  // cannot fail in practice — kept as an explicit Result rather than a
  // non-null assertion, matching this codebase's "never assume, always
  // handle" convention for anything reading configuration.
  let origin: string;
  try {
    origin = new URL(parseAppUrl()).origin;
  } catch {
    return respondResult(err(internalError('NEXT_PUBLIC_APP_URL not configured', correlationId)), {
      setCookieHeader,
    });
  }

  const tokenResult = await issueVapiToken(voiceTokenDeps, {
    sessionId,
    locale: body.locale,
    origin,
    correlationId,
  });
  return respondResult(tokenResult, { setCookieHeader });
}
