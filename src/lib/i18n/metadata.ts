/**
 * Locale metadata alternates helper — Runbook Step 13.
 *
 * Builds the `canonical`/`languages` shape Next.js's Metadata API expects
 * (`alternates.canonical`, `alternates.languages`), including an
 * `x-default` entry pointing at `DEFAULT_LOCALE`. Kept as a pure function,
 * separate from `generateMetadata`, so alternate-URL construction is unit
 * testable without rendering a route.
 */

import type { Metadata } from 'next';
import { chromeText, type ChromeKey } from './chrome';
import { DEFAULT_LOCALE, LOCALES, type Locale } from './locale';

export interface LocaleMetadataAlternates {
  readonly canonical: string;
  readonly languages: Record<string, string>;
}

/**
 * `localePath` is the part of the route after the locale segment (e.g. `''`
 * for the locale root, `'/menu'` for a future `/en/menu`). It must already
 * be a safe same-site path segment — this helper only prefixes locales, it
 * does not validate `localePath` itself.
 */
export function localeMetadataAlternates(
  locale: Locale,
  localePath = '',
): LocaleMetadataAlternates {
  const languages: Record<string, string> = {};
  for (const candidate of LOCALES) {
    languages[candidate] = `/${candidate}${localePath}`;
  }
  languages['x-default'] = `/${DEFAULT_LOCALE}${localePath}`;

  return {
    canonical: `/${locale}${localePath}`,
    languages,
  };
}

/**
 * Builds one inner page's metadata: a page-specific title (the layout's
 * template appends the brand), a truthful description, and the correct
 * canonical/alternate URLs for that path.
 *
 * Descriptions come from reviewed chrome copy, so a page summary can never
 * drift into an unapproved claim — and the same rule applies here as
 * everywhere else: no availability, no confirmation, no invented facility.
 */
export function localePageMetadata(
  locale: Locale,
  localePath: string,
  titleKey: ChromeKey,
  descriptionKey: ChromeKey,
): Metadata {
  return {
    title: chromeText(titleKey, locale),
    description: chromeText(descriptionKey, locale),
    alternates: localeMetadataAlternates(locale, localePath),
  };
}
