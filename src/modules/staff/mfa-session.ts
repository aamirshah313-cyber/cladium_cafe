/**
 * Short-lived, signed cookie carrying a *Supabase* Auth session between the
 * two legs of a real staff sign-in/enrollment flow — closes Step 45's
 * staff-auth blocker (D-049).
 *
 * This app's own long-lived staff session (`lib/staff-session.ts`) never
 * carries a Supabase access/refresh token — it only ever carries the opaque
 * `staffId` (`staff_profiles.id`), matching Step 24's original design. But
 * `@supabase/supabase-js`'s MFA API (`challenge`/`verify`/`enroll`) needs a
 * *live Supabase session* to operate on, which only exists for the few
 * seconds between `signInWithPassword` and the follow-up request carrying
 * the user's TOTP code. This cookie is that bridge, and only that bridge:
 * a short TTL, `HttpOnly`, a distinct cookie name from every other session
 * this app issues, and never read by anything except the two routes that
 * need it (`POST /api/staff/session`'s MFA leg,
 * `POST /api/staff/mfa/enroll*`).
 *
 * Signed (HS256, `lib/security/jwt.ts` — the real, spec-shaped signer built
 * for Vapi tokens in Step 31, reused here rather than duplicated) not
 * encrypted, matching this app's other session cookies' security posture:
 * `HttpOnly` + `Secure` + `SameSite=Lax` already keeps it out of
 * JavaScript and off the wire outside TLS, the same threat model
 * `lib/security/session.ts`'s guest/staff cookies already accept.
 */

import { assertServerOnly } from '../../lib/server-only';
import { parseSessionSecret } from '../../lib/env.server';
import { signJwt, verifyJwt } from '../../lib/security/jwt';
import {
  clearSessionCookie,
  readSessionToken,
  serializeSessionCookie,
} from '../../lib/security/session';
import type { StaffAuthSession } from '../integrations/supabase-auth-client';

assertServerOnly('src/modules/staff/mfa-session.ts');

const PENDING_MFA_BASE_NAME = 'cladium_staff_mfa_pending';
const PENDING_MFA_TTL_SECONDS = 5 * 60; // enough to type a 6-digit code, not enough to matter if leaked.

export type PendingMfaPurpose = 'SIGN_IN_CHALLENGE' | 'ENROLL_WINDOW';

export interface PendingMfaState {
  readonly purpose: PendingMfaPurpose;
  readonly session: StaffAuthSession;
  /** Set only for `SIGN_IN_CHALLENGE` — the factor/challenge this pending state exists to verify. */
  readonly factorId?: string;
  readonly challengeId?: string;
}

export function issuePendingMfaCookie(
  state: PendingMfaState,
  options: { secure: boolean; now?: Date },
): string {
  const secret = parseSessionSecret();
  const { token } = signJwt(
    {
      purpose: state.purpose,
      accessToken: state.session.accessToken,
      refreshToken: state.session.refreshToken,
      userId: state.session.userId,
      factorId: state.factorId,
      challengeId: state.challengeId,
    },
    secret,
    { ttlSeconds: PENDING_MFA_TTL_SECONDS, now: options.now },
  );
  return serializeSessionCookie(token, {
    secure: options.secure,
    baseName: PENDING_MFA_BASE_NAME,
    maxAgeSeconds: PENDING_MFA_TTL_SECONDS,
  });
}

export function clearPendingMfaCookie(options: { secure?: boolean } = {}): string {
  return clearSessionCookie({ secure: options.secure, baseName: PENDING_MFA_BASE_NAME });
}

/** `null` for a missing, malformed, forged, or expired cookie — never partially trusted. */
export function resolvePendingMfaState(
  headers: Parameters<typeof readSessionToken>[0],
  options: { secure?: boolean; now?: Date } = {},
): PendingMfaState | null {
  const token = readSessionToken(headers, {
    secure: options.secure,
    baseName: PENDING_MFA_BASE_NAME,
  });
  if (!token) return null;

  const secret = parseSessionSecret();
  const verified = verifyJwt(token, secret, { now: options.now });
  if (!verified.ok) return null;

  const claims = verified.value;
  if (
    (claims.purpose !== 'SIGN_IN_CHALLENGE' && claims.purpose !== 'ENROLL_WINDOW') ||
    typeof claims.accessToken !== 'string' ||
    typeof claims.refreshToken !== 'string' ||
    typeof claims.userId !== 'string'
  ) {
    return null;
  }

  return {
    purpose: claims.purpose,
    session: {
      accessToken: claims.accessToken,
      refreshToken: claims.refreshToken,
      userId: claims.userId,
    },
    factorId: typeof claims.factorId === 'string' ? claims.factorId : undefined,
    challengeId: typeof claims.challengeId === 'string' ? claims.challengeId : undefined,
  };
}
