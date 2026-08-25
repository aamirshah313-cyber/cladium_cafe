/**
 * CSRF defense: a stateless double-submit token bound to the session ID,
 * checked together with strict same-origin validation. production-
 * architecture-v2.md §12 requires both "CSRF protection" and "origin
 * checks" — this module treats them as one combined mutation guard because
 * either alone is an incomplete defense (origin headers can be stripped by
 * some proxies; a token alone does not stop a same-site-but-wrong-app
 * request). Deriving the token as an HMAC of the session ID means no
 * server-side token storage is needed.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertServerOnly } from '../server-only';
import { checkRequestOrigin, type RequestOriginHeaders, type TrustedOriginConfig } from './origin';

assertServerOnly('src/lib/security/csrf.ts');

export const CSRF_HEADER = 'x-csrf-token';

// Domain-separates the CSRF HMAC from other tokens (e.g. session signing)
// that might reuse the same secret.
const CSRF_CONTEXT = 'csrf';

export function createCsrfToken(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${CSRF_CONTEXT}:${sessionId}`).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyCsrfToken(
  candidate: string | null | undefined,
  sessionId: string,
  secret: string,
): boolean {
  if (!candidate) return false;
  return constantTimeEqual(candidate, createCsrfToken(sessionId, secret));
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** GET/HEAD/OPTIONS (and any other method not in the mutating set) are exempt — they must not mutate state in the first place. */
export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

export type MutationGuardFailureReason =
  'MISSING_ORIGIN' | 'UNTRUSTED_ORIGIN' | 'MISSING_CSRF_TOKEN' | 'BAD_CSRF_TOKEN';

export type MutationGuardResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: MutationGuardFailureReason };

export interface MutationGuardInput extends RequestOriginHeaders {
  readonly method: string;
  readonly csrfToken?: string | null;
  readonly sessionId: string;
  readonly secret: string;
}

/**
 * Combined same-origin + CSRF-token check for a state-changing request.
 * Origin is checked first: a forged/untrusted origin is rejected before the
 * (cheaper but less informative) token comparison runs.
 */
export function guardMutation(
  input: MutationGuardInput,
  originConfig: TrustedOriginConfig,
): MutationGuardResult {
  if (!isMutatingMethod(input.method)) return { ok: true };

  const originResult = checkRequestOrigin(input, originConfig);
  if (!originResult.trusted) {
    return {
      ok: false,
      reason: originResult.reason === 'MISSING' ? 'MISSING_ORIGIN' : 'UNTRUSTED_ORIGIN',
    };
  }

  if (!input.csrfToken) return { ok: false, reason: 'MISSING_CSRF_TOKEN' };
  if (!verifyCsrfToken(input.csrfToken, input.sessionId, input.secret)) {
    return { ok: false, reason: 'BAD_CSRF_TOKEN' };
  }

  return { ok: true };
}
