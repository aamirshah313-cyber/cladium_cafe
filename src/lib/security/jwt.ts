/**
 * Minimal, spec-shaped HS256 JWT signing/verification — Runbook Step 31.
 *
 * A real RFC 7519 compact JWT (`base64url(header).base64url(payload)
 * .base64url(HMAC-SHA256 signature)`), not `security/session.ts`'s
 * simplified two-part cookie format: the token this signs is handed to a
 * *third party* (Vapi's Web SDK/API — `modules/integrations/vapi-client.ts`)
 * that verifies it with its own standard JWT library, so the wire format
 * must be interoperable, not merely internally consistent.
 *
 * No JWT library dependency: `node:crypto`'s `createHmac`/`timingSafeEqual`
 * are the same primitives `security/session.ts`/`security/webhook.ts`
 * already use for exactly this reason — a hand-rolled HS256 JWT is a few
 * lines of base64url + HMAC, not enough surface area to justify a new
 * dependency for a scheme this codebase already implements twice.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertServerOnly } from '../server-only';
import { err, ok, type Result } from '../result';

assertServerOnly('src/lib/security/jwt.ts');

const HEADER_JSON = JSON.stringify({ alg: 'HS256', typ: 'JWT' });

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function base64UrlDecodeToJson(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function sign(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface SignJwtOptions {
  readonly ttlSeconds: number;
  readonly now?: Date;
}

/**
 * Signs `claims` as a compact HS256 JWT, injecting standard `iat`/`exp`
 * (epoch seconds) — the caller's own claim keys are never allowed to
 * override them (`iat`/`exp` in `claims` would be silently shadowed
 * otherwise, which is worse than refusing).
 */
export function signJwt(
  claims: Record<string, unknown>,
  secret: string,
  options: SignJwtOptions,
): { readonly token: string; readonly issuedAt: number; readonly expiresAt: number } {
  const now = options.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + options.ttlSeconds;

  const headerSegment = Buffer.from(HEADER_JSON, 'utf8').toString('base64url');
  const payloadSegment = base64UrlEncodeJson({ ...claims, iat: issuedAt, exp: expiresAt });
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const token = `${signingInput}.${sign(signingInput, secret)}`;

  return { token, issuedAt, expiresAt };
}

export type JwtVerificationError = 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED';

/**
 * Verifies signature and expiry. Exported for this codebase's own tests
 * (proving expiry/tamper behavior deterministically) — production never
 * needs to verify a token it signed itself, since Vapi is the verifier.
 */
export function verifyJwt(
  token: string,
  secret: string,
  options: { now?: Date } = {},
): Result<Record<string, unknown> & { iat: number; exp: number }, JwtVerificationError> {
  const parts = token.split('.');
  if (parts.length !== 3) return err('MALFORMED');
  const headerSegment = parts[0];
  const payloadSegment = parts[1];
  const signature = parts[2];
  if (!headerSegment || !payloadSegment || !signature) return err('MALFORMED');

  const signingInput = `${headerSegment}.${payloadSegment}`;
  if (!constantTimeEqual(signature, sign(signingInput, secret))) return err('BAD_SIGNATURE');

  let payload: unknown;
  try {
    payload = base64UrlDecodeToJson(payloadSegment);
  } catch {
    return err('MALFORMED');
  }
  if (typeof payload !== 'object' || payload === null) return err('MALFORMED');
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.iat !== 'number' || typeof candidate.exp !== 'number')
    return err('MALFORMED');

  const now = options.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (nowSeconds >= candidate.exp) return err('EXPIRED');

  return ok(candidate as Record<string, unknown> & { iat: number; exp: number });
}
