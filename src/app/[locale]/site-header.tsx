/**
 * Site header — Runbook Steps 15–16, developed into the real visual shell.
 *
 * Layout: the supplied crest and wordmark lead, primary navigation and the
 * language/theme utilities sit on the end, and one primary action (Request
 * a Table) is always visible. Below 1024px the navigation and utilities
 * move into `SiteDrawer` so they cannot consume the first screen; the
 * brand, the drawer trigger, and the header surface itself stay put.
 *
 * The header is a solid surface rather than a transparent overlay: the
 * homepage hero sits directly beneath it, and legibility over photography
 * matters more here than the small amount of atmosphere an overlay buys.
 *
 * The skip link is still the very first focusable element (WCAG 2.4.1), but
 * is now visually hidden until focused rather than permanently sitting
 * beside the brand.
 *
 * The crest is supplied artwork: rendered at its real aspect ratio, never
 * recoloured, never mirrored under RTL, and never redrawn with a font. Its
 * illustrated cabin and lake are part of the mark, not a photograph of the
 * venue, so it carries no caption implying otherwise.
 */

import Image from 'next/image';
import Link from 'next/link';
import { BRAND_NAME, chromeText } from '../../lib/i18n/chrome';
import type { Locale } from '../../lib/i18n/locale';
import type { Theme } from '../../lib/theme/theme';
import { brandLogo } from '../../modules/brand/asset-manifest';
import { LanguageSwitcher } from './language-switcher';
import { PrimaryNav } from './primary-nav';
import { SiteDrawer } from './site-drawer';
import { ThemeToggle } from './theme-toggle';

interface SiteHeaderProps {
  readonly locale: Locale;
  readonly initialTheme: Theme | null;
}

export function SiteHeader({ locale, initialTheme }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <a href="#main-content" className="u-skip-link">
        {chromeText('skipToContent', locale)}
      </a>

      <div className="u-container site-header-inner">
        {/*
         * The crest alone. The supplied artwork already contains the
         * `CLADIUM` wordmark, so setting the name again in type beside it
         * was both redundant and — measured at 1366px — the ~200px that
         * pushed the composed row past its container and made the page
         * scroll sideways. The link's accessible name comes from the
         * image's alt text, so nothing is lost to a screen reader.
         */}
        <Link href={`/${locale}`} className="site-brand" aria-label={BRAND_NAME}>
          <Image
            src={brandLogo.medium.path}
            alt={BRAND_NAME}
            width={brandLogo.medium.width}
            height={brandLogo.medium.height}
            className="site-brand-mark"
            priority
          />
        </Link>

        {/*
         * Language and theme stay visible at every width rather than moving
         * into the drawer. `design/theme-mode.md` calls the theme control
         * "persistent" and requires it in the header *and* mobile
         * navigation, and a preference a guest has to open a drawer to
         * reach is not persistent. They also come before the page links in
         * the DOM so the first navigation landmark on the page is a visible
         * one at every width; `order` puts them after the links visually on
         * desktop.
         */}
        <div className="site-header-utilities">
          <LanguageSwitcher locale={locale} />
          <ThemeToggle locale={locale} initialTheme={initialTheme} />
        </div>

        <div className="site-header-desktop">
          <PrimaryNav locale={locale} />
          <Link href={`/${locale}/book`} className="u-button u-button--primary site-header-cta">
            {chromeText('navBookLabel', locale)}
          </Link>
        </div>

        {/* The page links only — the utilities above are already reachable. */}
        <SiteDrawer locale={locale}>
          <PrimaryNav locale={locale} />
          <div className="site-drawer-utilities">
            <Link href={`/${locale}/book`} className="u-button u-button--primary">
              {chromeText('navBookLabel', locale)}
            </Link>
          </div>
        </SiteDrawer>
      </div>
    </header>
  );
}
