'use client';

/**
 * Language switcher — Runbook Step 13.
 *
 * Each option is a plain link to `/api/locale-preference`, which sets the
 * signed locale-preference cookie and redirects to the equivalent page
 * (`swapLocaleInPath`, applied there — see that route's doc comment for why
 * it can never emit an off-site redirect). Uses only reviewed chrome copy
 * (`chromeText`) — never business/menu text — and marks the active locale
 * with `aria-current` for accessibility.
 *
 * A client component solely to read the *actual* route it is rendering on.
 * `SiteHeader` used to pass the locale root, so switching language from any
 * inner page silently dropped the guest back to the homepage — the
 * redirect endpoint was always able to preserve the path, it was simply
 * never told what the path was. Every `[locale]` route is server-rendered
 * on demand, so both hooks return real values during SSR and the emitted
 * `href` is already correct in the HTML: the switcher keeps working with
 * JavaScript disabled, exactly as before.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { chromeText } from '../../lib/i18n/chrome';
import { LOCALES, localeDirection, type Locale } from '../../lib/i18n/locale';

/**
 * Query parameters that carry real guest context worth preserving across a
 * language change: the booking page's seating choice, and the menu page's
 * search/category filters. Deliberately an allowlist — anything else
 * (tracking parameters, one-time tokens, anything a link could smuggle in)
 * is dropped rather than reflected back into a redirect target.
 */
const PRESERVED_QUERY_PARAMS = ['seating', 'q', 'category'] as const;

function buildCurrentPath(pathname: string, searchParams: URLSearchParams): string {
  const preserved = new URLSearchParams();
  for (const key of PRESERVED_QUERY_PARAMS) {
    const value = searchParams.get(key);
    if (value !== null && value !== '') preserved.set(key, value);
  }
  const query = preserved.toString();
  return query ? `${pathname}?${query}` : pathname;
}

interface LanguageSwitcherProps {
  readonly locale: Locale;
}

export function LanguageSwitcher({ locale }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = buildCurrentPath(pathname ?? `/${locale}`, new URLSearchParams(searchParams));

  return (
    <label className="site-preference">
      <span>{chromeText('languageSwitcherLabel', locale)}</span>
      <select
        value={locale}
        onChange={(event) => {
          window.location.assign(
            `/api/locale-preference?to=${event.target.value}&path=${encodeURIComponent(currentPath)}`,
          );
        }}
      >
        {LOCALES.map((targetLocale) => {
          const nameKey = targetLocale === 'en' ? 'englishLanguageName' : 'urduLanguageName';
          return (
            <option
              key={targetLocale}
              value={targetLocale}
              lang={targetLocale}
              dir={localeDirection(targetLocale)}
            >
              {chromeText(nameKey, targetLocale)}
            </option>
          );
        })}
      </select>
    </label>
  );
}
