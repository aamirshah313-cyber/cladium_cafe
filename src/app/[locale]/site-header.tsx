/**
 * Site header — Runbook Step 15.
 *
 * The skip link is the very first focusable element (WCAG 2.4.1), pointing
 * at `#main-content` in `layout.tsx`. Primary navigation currently has one
 * entry (Home): every other destination in `design/site-map.md` (Menu,
 * Visit, Concierge) is a later step, and "hide unavailable routes" (this
 * step's own scope) means not linking to a page that doesn't exist yet.
 * Language and theme are utility controls, not primary navigation, so they
 * get their own labelled groups rather than living inside the `nav`.
 *
 * The Home link is unconditionally `aria-current="page"`: correct today,
 * because `/${locale}` is the only route that exists. `layout.tsx` only
 * receives the locale segment, not the full pathname, so once Steps 16–18
 * add real destinations, this needs an actual current-path comparison
 * instead of an assumption.
 */

import Link from 'next/link';
import { BRAND_NAME, chromeText } from '../../lib/i18n/chrome';
import type { Locale } from '../../lib/i18n/locale';
import type { Theme } from '../../lib/theme/theme';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';

interface SiteHeaderProps {
  readonly locale: Locale;
  readonly initialTheme: Theme | null;
}

export function SiteHeader({ locale, initialTheme }: SiteHeaderProps) {
  return (
    <header>
      <a href="#main-content">{chromeText('skipToContent', locale)}</a>
      <Link href={`/${locale}`}>{BRAND_NAME}</Link>
      <nav aria-label={chromeText('primaryNavLabel', locale)}>
        <ul>
          <li>
            <Link href={`/${locale}`} aria-current="page">
              {chromeText('navHomeLabel', locale)}
            </Link>
          </li>
        </ul>
      </nav>
      <LanguageSwitcher locale={locale} currentPath={`/${locale}`} />
      <ThemeToggle locale={locale} initialTheme={initialTheme} />
    </header>
  );
}
