/**
 * Locale routing primitives: negotiation, direction, and safe path handling.
 *
 * Isomorphic and secret-free (safe to import from client components), unlike
 * `security/redirect.ts` which is server-only because it guards privileged
 * request flows. `isSafeSameSitePath` duplicates that module's same-origin
 * checks deliberately — this module must never import a server-only module
 * into a bundle that a client language switcher also uses.
 *
 * `negotiateLocale` only ever returns a member of `LOCALES`: a closed enum,
 * never a caller-supplied string. That is what makes locale negotiation
 * structurally incapable of producing an open redirect target.
 */

import { localeSchema, type Locale } from '../schemas/common';

export type { Locale };
export const LOCALES: readonly Locale[] = localeSchema.options;
export const DEFAULT_LOCALE: Locale = 'en';

const DIRECTION_BY_LOCALE: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  ur: 'rtl',
};

export function isSupportedLocale(value: unknown): value is Locale {
  return localeSchema.safeParse(value).success;
}

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return DIRECTION_BY_LOCALE[locale];
}

interface AcceptLanguageEntry {
  readonly tag: string;
  readonly quality: number;
}

/** Parses an `Accept-Language` header into primary-subtag/quality pairs, most preferred first. Malformed entries are dropped, not thrown on. */
function parseAcceptLanguageHeader(header: string): AcceptLanguageEntry[] {
  return header
    .split(',')
    .map((part): AcceptLanguageEntry | null => {
      const [rawTag, ...params] = part.trim().split(';');
      const tag = rawTag?.trim().toLowerCase();
      if (!tag) return null;
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const quality = qParam ? Number(qParam.slice(2)) : 1;
      if (!Number.isFinite(quality) || quality < 0 || quality > 1) return null;
      return { tag, quality };
    })
    .filter((entry): entry is AcceptLanguageEntry => entry !== null)
    .sort((a, b) => b.quality - a.quality);
}

/** Reduces an `Accept-Language` header to the supported locales it names, most preferred first (e.g. "ur-PK" matches "ur"). */
export function parseAcceptLanguage(header: string | null | undefined): Locale[] {
  if (!header) return [];
  const seen = new Set<Locale>();
  const result: Locale[] = [];
  for (const { tag } of parseAcceptLanguageHeader(header)) {
    const primarySubtag = tag.split('-')[0];
    if (isSupportedLocale(primarySubtag) && !seen.has(primarySubtag)) {
      seen.add(primarySubtag);
      result.push(primarySubtag);
    }
  }
  return result;
}

export interface NegotiateLocaleInput {
  /** A locale already verified by the caller (e.g. a signature-checked preference cookie). Untrusted raw input must not be passed here. */
  readonly verifiedCookieLocale?: Locale | null;
  readonly acceptLanguageHeader?: string | null;
}

/** Always returns a member of `LOCALES` — never an arbitrary string, so this can never drive an open redirect. */
export function negotiateLocale(input: NegotiateLocaleInput): Locale {
  if (input.verifiedCookieLocale && isSupportedLocale(input.verifiedCookieLocale)) {
    return input.verifiedCookieLocale;
  }
  const [preferred] = parseAcceptLanguage(input.acceptLanguageHeader);
  return preferred ?? DEFAULT_LOCALE;
}

const CONTROL_CHAR_PATTERN = new RegExp('[\\x00-\\x1f\\x7f]');
const RESOLUTION_BASE = 'https://cladium-locale-path-check.invalid';

/** Same-site relative-path check (mirrors `security/redirect.ts`'s algorithm; see module doc for why this is a deliberate duplicate, not a shared import). */
export function isSafeSameSitePath(target: string | null | undefined): target is string {
  if (!target) return false;
  if (CONTROL_CHAR_PATTERN.test(target)) return false;
  if (!target.startsWith('/')) return false;
  if (target.startsWith('//')) return false;
  if (target.startsWith('/\\')) return false;

  let resolved: URL;
  try {
    resolved = new URL(target, RESOLUTION_BASE);
  } catch {
    return false;
  }
  return resolved.origin === RESOLUTION_BASE;
}

/**
 * Strips a recognized leading `/en` or `/ur` locale segment, if present.
 * Handles the segment being followed by a deeper path (`/en/menu`), nothing
 * (`/en`), or a query/hash directly (`/en?ref=1`, `/en#top`) — not just the
 * slash-separated case — so a query string or hash on the locale root is
 * never mistaken for part of the next path segment. Returns `null` when the
 * path carries no recognized locale prefix at all, so the caller can fall
 * back to the target locale's root instead of guessing where the "rest" of
 * an unrelated path should live under the new locale.
 */
function stripLocalePrefix(pathname: string): string | null {
  for (const locale of LOCALES) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return '';
    if (
      pathname.startsWith(`${prefix}/`) ||
      pathname.startsWith(`${prefix}?`) ||
      pathname.startsWith(`${prefix}#`)
    ) {
      return pathname.slice(prefix.length);
    }
  }
  return null;
}

/**
 * Builds the same page under a different locale, preserving the rest of the
 * path. Falls back to the target locale's root when the incoming path is not
 * a safe same-site path, so a caller can never smuggle an off-site or
 * protocol-relative target through the switcher.
 */
export function swapLocaleInPath(pathname: string, targetLocale: Locale): string {
  if (!isSafeSameSitePath(pathname)) return `/${targetLocale}`;
  const rest = stripLocalePrefix(pathname);
  if (rest === null || rest === '' || rest === '/') return `/${targetLocale}`;
  const candidate = `/${targetLocale}${rest}`;
  return isSafeSameSitePath(candidate) ? candidate : `/${targetLocale}`;
}
