/**
 * Guest session resolution — Runbook Step 20.
 *
 * The first piece of route code to actually use `security/session.ts`'s
 * signed opaque session cookie (built in Step 12, unused until now): reads
 * and verifies an existing cookie, or mints a fresh session ID and cookie
 * when none is present or it fails verification. `sessionId` is what every
 * session-owned store (`modules/takeaway/cart-store.ts`) keys on — a guest
 * can only ever look up the cart stored under their own verified session
 * ID, never another session's.
 */

import { randomUUID } from 'node:crypto';
import { assertServerOnly } from './server-only';
import { createSessionToken, serializeSessionCookie, verifySessionToken } from './security/session';

assertServerOnly('src/lib/customer-session.ts');

export interface ResolveCustomerSessionInput {
  /** The raw cookie value already extracted by the caller, if any. */
  readonly existingToken: string | undefined;
  readonly secret: string;
  readonly secure: boolean;
  readonly now?: Date;
}

export interface ResolvedCustomerSession {
  readonly sessionId: string;
  readonly isNew: boolean;
  /** Only set when a fresh session was minted — the caller must attach this `Set-Cookie` header to the response. */
  readonly setCookieHeader: string | null;
}

export function resolveCustomerSession(
  input: ResolveCustomerSessionInput,
): ResolvedCustomerSession {
  if (input.existingToken) {
    const verified = verifySessionToken(input.existingToken, input.secret, { now: input.now });
    if (verified.ok) {
      return { sessionId: verified.value.sessionId, isNew: false, setCookieHeader: null };
    }
  }

  const sessionId = randomUUID();
  const token = createSessionToken(input.secret, { sessionId, now: input.now });
  return {
    sessionId,
    isNew: true,
    setCookieHeader: serializeSessionCookie(token, { secure: input.secure }),
  };
}

export interface ReadVerifiedSessionIdInput {
  readonly existingToken: string | undefined;
  readonly secret: string;
  readonly now?: Date;
}

/**
 * Read-only counterpart to `resolveCustomerSession` — never mints a session,
 * never returns a cookie to set. For a Server Component (e.g. a layout
 * deciding whether a consent-gated script may render) that cannot attach a
 * `Set-Cookie` header to its own render. No cookie yet, or a token that
 * fails verification, both resolve to `null` — the same "no session" state
 * a guest who has never interacted with a session-minting route is
 * genuinely in, never an invented one.
 */
export function readVerifiedSessionId(input: ReadVerifiedSessionIdInput): string | null {
  if (!input.existingToken) return null;
  const verified = verifySessionToken(input.existingToken, input.secret, { now: input.now });
  return verified.ok ? verified.value.sessionId : null;
}
