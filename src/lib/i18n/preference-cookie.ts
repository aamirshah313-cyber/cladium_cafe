/**
 * Signed, non-sensitive locale-preference cookie.
 *
 * data-model-v2.md §7 calls locale/theme preference cookies "small,
 * non-sensitive" — unlike `security/session.ts` this carries no session
 * identity and grants no access. It is still HMAC-signed, for two reasons:
 * so a forged value cannot be used to skip locale negotiation with an
 * unsupported value, and so this cookie is "compatible with later secure
 * session handling" (CLAUDE.md Step 13 scope) once locale preference moves
 * onto `customer_sessions`. Signing reuses `SESSION_SECRET` with a domain
 * separation prefix, exactly as `security/csrf.ts` does for the same secret.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertServerOnly } from '../server-only';
import { err, ok, type Result } from '../result';
import { isSupportedLocale, type Locale } from './locale';

assertServerOnly('src/lib/i18n/preference-cookie.ts');

const SECURE_COOKIE_NAME = '__Host-cladium_locale';
const INSECURE_COOKIE_NAME = 'cladium_locale';
const LOCALE_CONTEXT = 'locale';
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year: a display preference, not a session

export function localeCookieName(secure = true): string {
  return secure ? SECURE_COOKIE_NAME : INSECURE_COOKIE_NAME;
}

function sign(locale: Locale, secret: string): string {
  return createHmac('sha256', secret).update(`${LOCALE_CONTEXT}:${locale}`).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Builds the signed cookie value `<locale>.<hmac>`. */
export function signLocalePreference(locale: Locale, secret: string): string {
  return `${locale}.${sign(locale, secret)}`;
}

export type LocalePreferenceError = 'MALFORMED' | 'BAD_SIGNATURE';

/** Verifies a cookie value produced by `signLocalePreference`, rejecting any tampered or unsupported-locale value. */
export function verifyLocalePreference(
  token: string,
  secret: string,
): Result<Locale, LocalePreferenceError> {
  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) return err('MALFORMED');

  const localePart = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!isSupportedLocale(localePart)) return err('MALFORMED');
  if (!constantTimeEqual(signature, sign(localePart, secret))) return err('BAD_SIGNATURE');

  return ok(localePart);
}

export interface LocalePreferenceCookieOptions {
  /** Defaults to true. Only pass false for plain-HTTP local development. */
  readonly secure?: boolean;
  readonly maxAgeSeconds?: number;
}

/** Builds a `Set-Cookie` header value. `HttpOnly`, `SameSite=Lax`, and `Path=/` are fixed, matching `security/session.ts`'s cookie hardening. */
export function serializeLocalePreferenceCookie(
  token: string,
  options: LocalePreferenceCookieOptions = {},
): string {
  const secure = options.secure ?? true;
  const attributes = [`${localeCookieName(secure)}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) attributes.push('Secure');
  attributes.push(`Max-Age=${options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS}`);
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

/** Extracts the raw signed locale-preference token from a `Cookie` request header, if present. */
export function readLocalePreferenceToken(
  headers: HeaderSource | undefined,
  options: { secure?: boolean } = {},
): string | undefined {
  if (!headers) return undefined;
  const cookieHeader = readCookieHeader(headers);
  if (!cookieHeader) return undefined;

  const name = localeCookieName(options.secure ?? true);
  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) continue;
    const rawName = part.slice(0, separatorIndex).trim();
    if (rawName === name) return part.slice(separatorIndex + 1).trim();
  }
  return undefined;
}
