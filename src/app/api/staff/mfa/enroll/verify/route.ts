/**
 * POST /api/staff/mfa/enroll/verify — Runbook Step 45 (D-049).
 *
 * Completes the enrollment `POST /api/staff/mfa/enroll` started: verifies
 * the 6-digit code against the factor id embedded in the pending-MFA
 * cookie (never a client-supplied factor id — `mfa-session.ts`'s own doc
 * comment explains why), and on success issues the real, long-lived staff
 * session cookie — first-time enrollment doubles as completing sign-in,
 * the same UX every mainstream "set up 2FA on first login" flow uses.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { checkBodySize, checkContentType } from '../../../../../../lib/security/request-limits';
import { checkRequestOrigin, trustedOriginConfig } from '../../../../../../lib/security/origin';
import { parseAppUrl } from '../../../../../../lib/env';
import { parseSessionSecret } from '../../../../../../lib/env.server';
import { correlationIdFrom } from '../../../../../../lib/correlation';
import { parseAtBoundary } from '../../../../../../lib/schemas/parse';
import { err, ok } from '../../../../../../lib/result';
import { forbidden, internalError, rateLimited, unauthorized } from '../../../../../../lib/errors';
import {
  guestRouteRateLimiter,
  STAFF_SIGNIN_RATE_LIMIT_RULE,
} from '../../../../../../lib/http/route-rate-limits';
import { issueStaffSessionCookie } from '../../../../../../lib/staff-session';
import { staffAuthClient } from '../../../../../../modules/staff/deps';
import { staffMfaEnrollVerifyBodySchema } from '../../../../../../modules/staff/schemas';
import { completeTotpEnrollment } from '../../../../../../modules/staff/supabase-credentials';
import {
  clearPendingMfaCookie,
  resolvePendingMfaState,
} from '../../../../../../modules/staff/mfa-session';

export async function POST(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);
  const secure = request.nextUrl.protocol === 'https:';

  const contentTypeCheck = checkContentType(
    request.headers.get('content-type'),
    undefined,
    correlationId,
  );
  if (!contentTypeCheck.ok) return respondResult(err(contentTypeCheck.error));

  const rawBody = await request.text();
  const bodySizeCheck = checkBodySize(rawBody, undefined, correlationId);
  if (!bodySizeCheck.ok) return respondResult(err(bodySizeCheck.error));

  let appOrigin: string;
  try {
    appOrigin = new URL(parseAppUrl()).origin;
  } catch {
    return respondResult(err(forbidden(correlationId)));
  }
  const originResult = checkRequestOrigin(
    { origin: request.headers.get('origin'), referer: request.headers.get('referer') },
    trustedOriginConfig([appOrigin]),
  );
  if (!originResult.trusted) return respondResult(err(forbidden(correlationId)));

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return respondResult(err(forbidden(correlationId)));
  }
  const bodyResult = parseAtBoundary(staffMfaEnrollVerifyBodySchema, parsedJson, correlationId);
  if (!bodyResult.ok) return respondResult(bodyResult);

  const pending = resolvePendingMfaState(request.headers, { secure });
  if (!pending) return respondResult(err(unauthorized(correlationId)));

  const rateDecision = await guestRouteRateLimiter.consume(
    `staff-mfa-enroll-verify:${pending.session.userId}`,
    STAFF_SIGNIN_RATE_LIMIT_RULE,
  );
  if (!rateDecision.allowed) return respondResult(err(rateLimited(correlationId)));

  let result;
  try {
    result = await completeTotpEnrollment(
      { authClient: staffAuthClient },
      pending,
      bodyResult.value.code,
    );
  } catch {
    return respondResult(err(internalError('Staff auth provider call failed', correlationId)));
  }
  if (!result) return respondResult(err(unauthorized(correlationId)));

  let secret: string;
  try {
    secret = parseSessionSecret();
  } catch {
    return respondResult(err(internalError('SESSION_SECRET not configured', correlationId)));
  }

  const setCookieHeader = issueStaffSessionCookie(result.account.staffId, secret, { secure });
  return respondResult(
    ok({
      staffId: result.account.staffId,
      displayName: result.account.displayName,
      roles: result.account.roles,
    }),
    { setCookieHeader: [setCookieHeader, clearPendingMfaCookie({ secure })] },
  );
}
