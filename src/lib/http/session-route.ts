/**
 * Shared session/CSRF/origin resolution for guest-mutating API routes —
 * Runbook Step 20.
 *
 * The first real caller of `customer-session.ts`, `security/csrf.ts`, and
 * `security/origin.ts` together. Kept as pure, testable functions taking
 * plain header/cookie values — the route handlers under `app/api/takeaway/`
 * are thin glue that extracts those values from a `NextRequest` and calls
 * these. Fails *closed*: a missing `SESSION_SECRET` or `NEXT_PUBLIC_APP_URL`
 * blocks the request rather than silently skipping the check — unlike
 * locale negotiation (`lib/i18n/request-locale.ts`), this guard is
 * security-sensitive, so "config not ready yet" must not mean "unprotected."
 */

import { parseAppUrl } from '../env';
import { parseSessionSecret } from '../env.server';
import { assertServerOnly } from '../server-only';
import { err, ok, type Result } from '../result';
import { forbidden, internalError, type AppError } from '../errors';
import { resolveCustomerSession } from '../customer-session';
import { createCsrfToken, guardMutation, isMutatingMethod } from '../security/csrf';
import { readSessionToken } from '../security/session';
import { trustedOriginConfig } from '../security/origin';

assertServerOnly('src/lib/http/session-route.ts');

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

export interface SessionRouteContext {
  readonly sessionId: string;
  readonly csrfToken: string;
  /** Attach to the response when non-null — a fresh session was minted. */
  readonly setCookieHeader: string | null;
}

export interface ResolveSessionContextInput {
  readonly headers: HeaderSource;
  readonly secure: boolean;
  readonly now?: Date;
}

/** Reads/mints the guest session and derives its (deterministic, unsigned-payload) CSRF token. Never fails — a missing SESSION_SECRET is reported at `guardStateChangingRequest` instead, since a read-only GET does not need one. */
export function resolveSessionContext(
  input: ResolveSessionContextInput,
): Result<SessionRouteContext, AppError> {
  let secret: string;
  try {
    secret = parseSessionSecret();
  } catch {
    return err(internalError('SESSION_SECRET not configured', undefined));
  }

  const existingToken = readSessionToken(input.headers, { secure: input.secure });
  const resolved = resolveCustomerSession({
    existingToken,
    secret,
    secure: input.secure,
    now: input.now,
  });

  return ok({
    sessionId: resolved.sessionId,
    csrfToken: createCsrfToken(resolved.sessionId, secret),
    setCookieHeader: resolved.setCookieHeader,
  });
}

export interface GuardStateChangingRequestInput {
  readonly method: string;
  readonly origin?: string | null;
  readonly referer?: string | null;
  readonly sessionId: string;
  readonly csrfToken?: string | null;
  readonly correlationId?: string;
}

/** No-op for a non-mutating method (GET/HEAD/OPTIONS) — see `isMutatingMethod`. */
export function guardStateChangingRequest(
  input: GuardStateChangingRequestInput,
): Result<void, AppError> {
  if (!isMutatingMethod(input.method)) return ok(undefined);

  let secret: string;
  try {
    secret = parseSessionSecret();
  } catch {
    return err(internalError('SESSION_SECRET not configured', input.correlationId));
  }

  let appOrigin: string;
  try {
    appOrigin = new URL(parseAppUrl()).origin;
  } catch {
    // Fails closed: an unconfigured trusted origin must block mutations, not skip the check.
    return err(forbidden(input.correlationId));
  }

  const result = guardMutation(
    {
      method: input.method,
      origin: input.origin,
      referer: input.referer,
      sessionId: input.sessionId,
      csrfToken: input.csrfToken,
      secret,
    },
    trustedOriginConfig([appOrigin]),
  );

  return result.ok ? ok(undefined) : err(forbidden(input.correlationId));
}
