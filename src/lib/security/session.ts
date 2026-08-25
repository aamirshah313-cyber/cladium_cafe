/**
 * Signed opaque guest session cookies.
 *
 * The cookie value carries no meaning by itself: a random session ID plus an
 * expiry, HMAC-SHA256 signed, so a tampered or forged cookie fails
 * verification before any session ID reaches a database lookup. Signing and
 * verification run in the Node.js runtime deliberately — production-
 * architecture-v2.md §2 reserves "secrets [and] signatures" for Node, not
 * Edge — so this module uses `node:crypto` rather than Web Crypto.
 *
 * The `__Host-` cookie-name prefix is the production default: browsers
 * refuse it without `Secure`, `Path=/`, and no `Domain` attribute, which is
 * exactly the shape a session cookie should have. Passing `secure: false`
 * (for plain-HTTP local development only) uses a plain cookie name instead,
 * because a browser would silently drop a `__Host-` cookie sent without
 * `Secure`.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { assertServerOnly } from '../server-only';
import { err, ok, type Result } from '../result';

assertServerOnly('src/lib/security/session.ts');

const SECURE_COOKIE_NAME = '__Host-cladium_session';
const INSECURE_COOKIE_NAME = 'cladium_session';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days: an idle guest session, not an authenticated staff one

export function sessionCookieName(secure = true): string {
  return secure ? SECURE_COOKIE_NAME : INSECURE_COOKIE_NAME;
}

export interface SessionPayload {
  readonly sessionId: string;
  readonly issuedAt: number; // epoch seconds
  readonly expiresAt: number; // epoch seconds
}

export type SessionTokenError = 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED';

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Rejects on length mismatch before comparing, so `timingSafeEqual` never throws. */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSessionToken(
  secret: string,
  options: { sessionId?: string; now?: Date; ttlSeconds?: number } = {},
): string {
  const now = options.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const payload: SessionPayload = {
    sessionId: options.sessionId ?? randomUUID(),
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function isSessionPayloadShape(value: unknown): value is SessionPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.issuedAt === 'number' &&
    typeof candidate.expiresAt === 'number'
  );
}

export function verifySessionToken(
  token: string,
  secret: string,
  options: { now?: Date } = {},
): Result<SessionPayload, SessionTokenError> {
  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) return err('MALFORMED');

  const encodedPayload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!constantTimeEqual(signature, sign(encodedPayload, secret))) return err('BAD_SIGNATURE');

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return err('MALFORMED');
  }
  if (!isSessionPayloadShape(payload)) return err('MALFORMED');

  const now = options.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (nowSeconds >= payload.expiresAt) return err('EXPIRED');

  return ok(payload);
}

export interface SessionCookieOptions {
  /** Defaults to true. Only pass false for plain-HTTP local development. */
  readonly secure?: boolean;
  readonly maxAgeSeconds?: number;
}

/** Builds a `Set-Cookie` header value. `HttpOnly`, `SameSite=Lax`, and `Path=/` are fixed, not configurable. */
export function serializeSessionCookie(token: string, options: SessionCookieOptions = {}): string {
  const secure = options.secure ?? true;
  const attributes = [
    `${sessionCookieName(secure)}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) attributes.push('Secure');
  if (options.maxAgeSeconds !== undefined) attributes.push(`Max-Age=${options.maxAgeSeconds}`);
  return attributes.join('; ');
}

/** Builds a `Set-Cookie` header value that clears the session cookie (logout / invalidation). */
export function clearSessionCookie(options: { secure?: boolean } = {}): string {
  const secure = options.secure ?? true;
  const attributes = [
    `${sessionCookieName(secure)}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

function readCookieHeader(headers: HeaderSource): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get('cookie') ?? undefined;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const raw = record.cookie ?? record.Cookie;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Extracts the raw session token from a `Cookie` request header, if present. */
export function readSessionToken(
  headers: HeaderSource | undefined,
  options: { secure?: boolean } = {},
): string | undefined {
  if (!headers) return undefined;
  const cookieHeader = readCookieHeader(headers);
  if (!cookieHeader) return undefined;

  const name = sessionCookieName(options.secure ?? true);
  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) continue;
    const rawName = part.slice(0, separatorIndex).trim();
    if (rawName === name) return part.slice(separatorIndex + 1).trim();
  }
  return undefined;
}
