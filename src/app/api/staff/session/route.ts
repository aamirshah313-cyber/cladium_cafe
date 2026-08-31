/**
 * GET/POST/DELETE /api/staff/session — Runbook Step 24, real auth added
 * Step 45 (D-049).
 *
 * GET resolves the current staff session (if any) so the workspace UI can
 * decide sign-in-form vs. dashboard on load, mirroring
 * `/api/session/csrf`'s bootstrap role for guests — unchanged by Step 45,
 * since `resolveStaffActor`/`staffDirectory` already work identically for
 * dev and real accounts (D-028).
 *
 * POST now branches on the request body's own `mode` field, not on server
 * config: a body with `staffId`/`devPassword` (no `mode`) is the
 * development-only sign-in seam (`modules/staff/dev-credentials.ts` —
 * never production auth); a body with `mode: 'password'` or
 * `mode: 'mfa'` is the real Supabase-backed flow
 * (`modules/staff/supabase-credentials.ts`), which itself fails closed to
 * `401`/`500` in any environment lacking real Supabase configuration —
 * never a way to bypass anything. The two-phase real flow exists because
 * an owner/manager account can never reach a signed-in session without a
 * verified MFA factor (`supabase-credentials.ts`'s own doc comment) —
 * Gate 3 enforced structurally, not by ops discipline alone.
 *
 * DELETE clears both the staff cookie and any stray pending-MFA cookie
 * unconditionally; no origin/CSRF guard is needed to sign a browser out of
 * its own session.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { checkBodySize, checkContentType } from '../../../../lib/security/request-limits';
import { checkRequestOrigin, trustedOriginConfig } from '../../../../lib/security/origin';
import {
  guestRouteRateLimiter,
  STAFF_SIGNIN_RATE_LIMIT_RULE,
} from '../../../../lib/http/route-rate-limits';
import { parseAppUrl } from '../../../../lib/env';
import { parseSessionSecret } from '../../../../lib/env.server';
import { correlationIdFrom } from '../../../../lib/correlation';
import { parseAtBoundary } from '../../../../lib/schemas/parse';
import { err, ok, type Result } from '../../../../lib/result';
import {
  forbidden,
  internalError,
  rateLimited,
  unauthorized,
  type AppError,
} from '../../../../lib/errors';
import { resolveStaffActor } from '../../../../lib/http/staff-session-route';
import { issueStaffSessionCookie, clearStaffSessionCookie } from '../../../../lib/staff-session';
import { verifyDevStaffCredentials } from '../../../../modules/staff/dev-credentials';
import { staffDirectory, devAccounts, staffAuthClient } from '../../../../modules/staff/deps';
import {
  staffSignInBodySchema,
  staffSignInRealBodySchema,
} from '../../../../modules/staff/schemas';
import type { StaffAccount } from '../../../../modules/staff/directory';
import {
  completeSupabaseMfaChallenge,
  signInWithSupabasePassword,
} from '../../../../modules/staff/supabase-credentials';
import {
  clearPendingMfaCookie,
  resolvePendingMfaState,
} from '../../../../modules/staff/mfa-session';

export async function GET(request: NextRequest) {
  const result = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId: correlationIdFrom(request.headers),
  });
  if (!result.ok) return respondResult(result);
  const { staffId, displayName, actor, csrfToken } = result.value;
  return respondResult(ok({ staffId, displayName, roles: actor.roles ?? [], csrfToken }));
}

/** Signed-in success response — the same shape whichever path (dev, real password, real MFA) reached it. */
function signedInResponse(
  account: StaffAccount,
  secure: boolean,
  correlationId: string | undefined,
  extraCookies: readonly string[] = [],
) {
  let secret: string;
  try {
    secret = parseSessionSecret();
  } catch {
    return respondResult(err(internalError('SESSION_SECRET not configured', correlationId)));
  }
  const setCookieHeader = issueStaffSessionCookie(account.staffId, secret, { secure });
  return respondResult(
    ok({ staffId: account.staffId, displayName: account.displayName, roles: account.roles }),
    { setCookieHeader: [setCookieHeader, ...extraCookies] },
  );
}

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
    return respondResult(
      err(forbidden(correlationId)), // malformed sign-in body — no need to distinguish reasons for an unauthenticated caller
    );
  }

  const isRealAuthAttempt =
    typeof parsedJson === 'object' &&
    parsedJson !== null &&
    typeof (parsedJson as Record<string, unknown>).mode === 'string';

  if (isRealAuthAttempt) {
    return handleRealSignIn(request, parsedJson, correlationId, secure);
  }
  return handleDevSignIn(parsedJson, correlationId, secure);
}

async function handleDevSignIn(
  parsedJson: unknown,
  correlationId: string | undefined,
  secure: boolean,
) {
  const bodyResult = parseAtBoundary(staffSignInBodySchema, parsedJson, correlationId);
  if (!bodyResult.ok) return respondResult(bodyResult);

  // Step 40: keyed by the *attempted* staffId, not client IP — see
  // `route-rate-limits.ts#STAFF_SIGNIN_RATE_LIMIT_RULE`'s doc comment for
  // why an unverified proxy header would be a false sense of protection.
  const rateDecision = await guestRouteRateLimiter.consume(
    `staff-signin:${bodyResult.value.staffId}`,
    STAFF_SIGNIN_RATE_LIMIT_RULE,
  );
  if (!rateDecision.allowed) return respondResult(err(rateLimited(correlationId)));

  const staffId = verifyDevStaffCredentials(
    devAccounts,
    bodyResult.value.staffId,
    bodyResult.value.devPassword,
  );
  if (!staffId) return respondResult(err(unauthorized(correlationId)));

  const account = await staffDirectory.findAccount(staffId);
  if (!account) return respondResult(err(unauthorized(correlationId)));

  return signedInResponse(account, secure, correlationId);
}

async function handleRealSignIn(
  request: NextRequest,
  parsedJson: unknown,
  correlationId: string | undefined,
  secure: boolean,
) {
  const bodyResult = parseAtBoundary(staffSignInRealBodySchema, parsedJson, correlationId);
  if (!bodyResult.ok) return respondResult(bodyResult);
  const body = bodyResult.value;

  if (body.mode === 'password') {
    const rateDecision = await guestRouteRateLimiter.consume(
      `staff-signin:${body.email.toLowerCase()}`,
      STAFF_SIGNIN_RATE_LIMIT_RULE,
    );
    if (!rateDecision.allowed) return respondResult(err(rateLimited(correlationId)));

    const outcomeResult = await tryStaffAuthCall(correlationId, () =>
      signInWithSupabasePassword({ authClient: staffAuthClient }, body.email, body.password, {
        secure,
      }),
    );
    if (!outcomeResult.ok) return respondResult(outcomeResult);
    const outcome = outcomeResult.value;

    if (outcome.kind === 'FAILED') return respondResult(err(unauthorized(correlationId)));
    if (outcome.kind === 'MFA_REQUIRED') {
      return respondResult(ok({ mfaRequired: true }), {
        setCookieHeader: outcome.pendingMfaCookie,
      });
    }
    if (outcome.kind === 'MFA_ENROLLMENT_REQUIRED') {
      return respondResult(ok({ mfaEnrollmentRequired: true }), {
        setCookieHeader: outcome.pendingMfaCookie,
      });
    }
    return signedInResponse(outcome.account, secure, correlationId);
  }

  // body.mode === 'mfa'
  const pending = resolvePendingMfaState(request.headers, { secure });
  if (!pending) return respondResult(err(unauthorized(correlationId)));

  const rateDecision = await guestRouteRateLimiter.consume(
    `staff-mfa:${pending.session.userId}`,
    STAFF_SIGNIN_RATE_LIMIT_RULE,
  );
  if (!rateDecision.allowed) return respondResult(err(rateLimited(correlationId)));

  const resultResult = await tryStaffAuthCall(correlationId, () =>
    completeSupabaseMfaChallenge({ authClient: staffAuthClient }, pending, body.code),
  );
  if (!resultResult.ok) return respondResult(resultResult);
  if (!resultResult.value) return respondResult(err(unauthorized(correlationId)));

  return signedInResponse(resultResult.value.account, secure, correlationId, [
    clearPendingMfaCookie({ secure }),
  ]);
}

/** Wraps a real Supabase call: any thrown error (misconfiguration, network) becomes a safe, generic 500 — never leaked detail, matching `orchestrateTurn`/`issueVapiToken`'s established "provider call may throw, the caller translates" convention. */
async function tryStaffAuthCall<T>(
  correlationId: string | undefined,
  call: () => Promise<T>,
): Promise<Result<T, AppError>> {
  try {
    return ok(await call());
  } catch {
    return err(internalError('Staff auth provider call failed', correlationId));
  }
}

export async function DELETE(request: NextRequest) {
  const secure = request.nextUrl.protocol === 'https:';
  return respondResult(ok({ signedOut: true }), {
    setCookieHeader: [clearStaffSessionCookie({ secure }), clearPendingMfaCookie({ secure })],
  });
}
