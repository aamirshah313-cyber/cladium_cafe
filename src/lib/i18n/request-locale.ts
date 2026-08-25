/**
 * Request-level locale negotiation and preference persistence — Runbook Step 13.
 *
 * Combines the signed preference cookie (`preference-cookie.ts`) and
 * `Accept-Language` negotiation (`locale.ts`) into the two decisions the
 * thin Next.js glue needs (`proxy.ts` reading, `app/api/locale-preference`
 * writing), kept separate from both so each can be unit-tested with plain
 * header/env objects instead of a real `NextRequest`.
 *
 * Neither function ever throws on a missing or invalid `SESSION_SECRET`:
 * negotiation degrades to `Accept-Language`-only, and persistence degrades to
 * "redirect without setting a cookie." Locale routing must not depend on
 * unrelated secret configuration (Vapi, WhatsApp, Anthropic) being complete.
 */

import { parseSessionSecret } from '../env.server';
import { assertServerOnly } from '../server-only';
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  negotiateLocale,
  swapLocaleInPath,
  type Locale,
} from './locale';
import {
  readLocalePreferenceToken,
  serializeLocalePreferenceCookie,
  signLocalePreference,
  verifyLocalePreference,
} from './preference-cookie';

assertServerOnly('src/lib/i18n/request-locale.ts');

type EnvSource = Record<string, string | undefined>;
type HeaderSource = Headers | Record<string, string | string[] | undefined>;

export interface NegotiateRequestLocaleInput {
  readonly headers: HeaderSource;
  readonly acceptLanguageHeader: string | null;
  /** Test-only override; production callers rely on the `process.env` default. */
  readonly secretSource?: EnvSource;
}

/** Verified cookie first, then `Accept-Language`, then `DEFAULT_LOCALE` — never an arbitrary string. */
export function negotiateRequestLocale(input: NegotiateRequestLocaleInput): Locale {
  const token = readLocalePreferenceToken(input.headers);
  let verifiedCookieLocale: Locale | null = null;

  if (token) {
    try {
      const secret = parseSessionSecret(input.secretSource);
      const result = verifyLocalePreference(token, secret);
      if (result.ok) verifiedCookieLocale = result.value;
    } catch {
      // SESSION_SECRET not configured — fall through to Accept-Language.
    }
  }

  return negotiateLocale({
    verifiedCookieLocale,
    acceptLanguageHeader: input.acceptLanguageHeader,
  });
}

export interface BuildLocalePreferenceRedirectInput {
  /** Untrusted `?to=` query value. Falls back to `DEFAULT_LOCALE` unless it names a supported locale. */
  readonly requestedLocale: string | null;
  /** Untrusted `?path=` query value. Validated by `swapLocaleInPath`. */
  readonly requestedPath: string | null;
  readonly secure: boolean;
  /** Test-only override; production callers rely on the `process.env` default. */
  readonly secretSource?: EnvSource;
}

export interface LocalePreferenceRedirect {
  readonly locale: Locale;
  readonly target: string;
  /** `Set-Cookie` header value, or `null` when `SESSION_SECRET` is not configured yet. */
  readonly setCookieHeader: string | null;
}

/** Never redirects off-site (see `swapLocaleInPath`) and never fails the redirect over a signing error. */
export function buildLocalePreferenceRedirect(
  input: BuildLocalePreferenceRedirectInput,
): LocalePreferenceRedirect {
  const locale: Locale = isSupportedLocale(input.requestedLocale)
    ? input.requestedLocale
    : DEFAULT_LOCALE;
  const target = swapLocaleInPath(input.requestedPath ?? '', locale);

  let setCookieHeader: string | null = null;
  try {
    const secret = parseSessionSecret(input.secretSource);
    const token = signLocalePreference(locale, secret);
    setCookieHeader = serializeLocalePreferenceCookie(token, { secure: input.secure });
  } catch {
    setCookieHeader = null;
  }

  return { locale, target, setCookieHeader };
}
