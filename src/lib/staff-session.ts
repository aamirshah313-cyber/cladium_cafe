/**
 * Staff session resolution — Runbook Step 24.
 *
 * Deliberately NOT a mirror of `customer-session.ts`: a guest session is
 * auto-minted the first time it's missing (anyone may browse anonymously),
 * but a staff session must never be silently created — an absent or invalid
 * cookie means "not signed in," full stop. Reuses the exact same signed
 * token primitive as the guest session (`security/session.ts`), just under
 * a distinct cookie name (`STAFF_SESSION_BASE_NAME`) so the two coexist in
 * one browser without colliding, and with a much shorter TTL appropriate to
 * an authenticated session rather than an idle anonymous one.
 *
 * The token's `sessionId` field holds the staff member's `staffId` — no
 * roles are baked into it. `lib/http/staff-session-route.ts` looks up
 * current roles from `modules/staff/directory.ts` on every request, so a
 * role change or account removal takes effect immediately rather than
 * waiting for the token to expire.
 */

import { assertServerOnly } from './server-only';
import {
  clearSessionCookie,
  createSessionToken,
  readSessionToken,
  serializeSessionCookie,
  verifySessionToken,
} from './security/session';

assertServerOnly('src/lib/staff-session.ts');

const STAFF_SESSION_BASE_NAME = 'cladium_staff_session';
const STAFF_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours: an authenticated shift, not an idle guest session.

export function issueStaffSessionCookie(
  staffId: string,
  secret: string,
  options: { secure: boolean; now?: Date } = { secure: true },
): string {
  const token = createSessionToken(secret, {
    sessionId: staffId,
    now: options.now,
    ttlSeconds: STAFF_SESSION_TTL_SECONDS,
  });
  return serializeSessionCookie(token, {
    secure: options.secure,
    baseName: STAFF_SESSION_BASE_NAME,
    maxAgeSeconds: STAFF_SESSION_TTL_SECONDS,
  });
}

export function clearStaffSessionCookie(options: { secure?: boolean } = {}): string {
  return clearSessionCookie({ secure: options.secure, baseName: STAFF_SESSION_BASE_NAME });
}

export function readStaffSessionToken(
  headers: Parameters<typeof readSessionToken>[0],
  options: { secure?: boolean } = {},
): string | undefined {
  return readSessionToken(headers, { secure: options.secure, baseName: STAFF_SESSION_BASE_NAME });
}

export interface ResolvedStaffSession {
  readonly staffId: string;
}

/** `null` for a missing, malformed, forged, or expired token — never auto-minted. */
export function resolveStaffSession(
  token: string | undefined,
  secret: string,
  options: { now?: Date } = {},
): ResolvedStaffSession | null {
  if (!token) return null;
  const verified = verifySessionToken(token, secret, { now: options.now });
  return verified.ok ? { staffId: verified.value.sessionId } : null;
}
