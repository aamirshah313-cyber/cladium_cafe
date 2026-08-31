/**
 * POST /api/staff/mfa/enroll — Runbook Step 45 (D-049).
 *
 * Starts real TOTP enrollment for the account currently in an
 * `ENROLL_WINDOW` (`modules/staff/mfa-session.ts`) — reached only via
 * `POST /api/staff/session`'s real-auth branch returning
 * `mfaEnrollmentRequired: true` (an OWNER/MANAGER account signing in for
 * the first time with no verified factor yet, Gate 3). No request body:
 * the pending cookie already carries the live Supabase session this needs.
 * No CSRF/staff-session guard either — there is no staff session yet at
 * this point, only the short-lived pending-MFA cookie, which is itself the
 * proof of a just-completed password sign-in.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../lib/http/respond';
import { correlationIdFrom } from '../../../../../lib/correlation';
import { err, ok } from '../../../../../lib/result';
import { forbidden, internalError, rateLimited, unauthorized } from '../../../../../lib/errors';
import { checkRequestOrigin, trustedOriginConfig } from '../../../../../lib/security/origin';
import { parseAppUrl } from '../../../../../lib/env';
import {
  guestRouteRateLimiter,
  STAFF_SIGNIN_RATE_LIMIT_RULE,
} from '../../../../../lib/http/route-rate-limits';
import { staffAuthClient } from '../../../../../modules/staff/deps';
import { startTotpEnrollment } from '../../../../../modules/staff/supabase-credentials';
import { resolvePendingMfaState } from '../../../../../modules/staff/mfa-session';

export async function POST(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);
  const secure = request.nextUrl.protocol === 'https:';

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

  const pending = resolvePendingMfaState(request.headers, { secure });
  if (!pending) return respondResult(err(unauthorized(correlationId)));

  const rateDecision = await guestRouteRateLimiter.consume(
    `staff-mfa-enroll:${pending.session.userId}`,
    STAFF_SIGNIN_RATE_LIMIT_RULE,
  );
  if (!rateDecision.allowed) return respondResult(err(rateLimited(correlationId)));

  let started;
  try {
    started = await startTotpEnrollment({ authClient: staffAuthClient }, pending, { secure });
  } catch {
    return respondResult(err(internalError('Staff auth provider call failed', correlationId)));
  }
  if (!started) return respondResult(err(unauthorized(correlationId)));

  return respondResult(
    ok({
      factorId: started.factorId,
      qrCodeDataUri: started.qrCodeDataUri,
      secret: started.secret,
    }),
    { setCookieHeader: started.pendingMfaCookie },
  );
}
