/**
 * Site header — Runbook Steps 15–16.
 *
 * The skip link is the very first focusable element (WCAG 2.4.1), pointing
 * at `#main-content` in `layout.tsx`. Primary navigation (`PrimaryNav`) has
 * Home and Visit — every other destination in `design/site-map.md` (Menu,
 * Concierge) is a later step, and "hide unavailable routes" (Step 15's
 * scope, still in force) means not linking to a page that doesn't exist
 * yet. Language and theme are utility controls, not primary navigation, so
 * they get their own labelled groups rather than living inside the `nav`.
 */

import Link from 'next/link';
import { BRAND_NAME, chromeText } from '../../lib/i18n/chrome';
import type { Locale } from '../../lib/i18n/locale';
import type { Theme } from '../../lib/theme/theme';
import { LanguageSwitcher } from './language-switcher';
import { PrimaryNav } from './primary-nav';
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
      <PrimaryNav locale={locale} />
      <LanguageSwitcher locale={locale} currentPath={`/${locale}`} />
      <ThemeToggle locale={locale} initialTheme={initialTheme} />
    </header>
  );
}
