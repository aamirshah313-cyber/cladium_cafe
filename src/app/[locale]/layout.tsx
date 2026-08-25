/**
 * Locale layout — Runbook Steps 13–14.
 *
 * Renders the real document shell (`<html>`/`<body>`) for every localized
 * route, with `lang`/`dir` derived from the validated route segment — never
 * guessed or defaulted silently: an unsupported segment 404s instead of
 * rendering with a wrong document language. `app/(root-fallback)/layout.tsx`
 * is a separate root layout for the un-localized `/` fallback (see its own
 * doc comment for why it cannot share this one); `proxy.ts` keeps a bare,
 * localeless route from reaching that fallback in the common case.
 *
 * `data-theme` is set here, server-side, from the (unsigned, isomorphic —
 * see `lib/theme/preference-cookie.ts`) theme cookie, so an explicit guest
 * choice renders correctly on the very first paint with no client-side
 * flash. When no cookie is set yet, the attribute is omitted entirely and
 * `globals.css`'s `prefers-color-scheme` media query decides the first-visit
 * default (theme-mode.md) — never guessed here.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import '../globals.css';
import { chromeText } from '../../lib/i18n/chrome';
import { LOCALES, isSupportedLocale, localeDirection } from '../../lib/i18n/locale';
import { localeMetadataAlternates } from '../../lib/i18n/metadata';
import { THEME_COOKIE_NAME } from '../../lib/theme/preference-cookie';
import { isSupportedTheme, type Theme } from '../../lib/theme/theme';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';

interface LocaleLayoutParams {
  readonly locale: string;
}

export function generateStaticParams(): LocaleLayoutParams[] {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LocaleLayoutParams>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) return {};

  return {
    title: 'Cladium Café & Resort',
    description: 'Cladium Café & Resort, Abbottabad — pre-launch scaffold.',
    alternates: localeMetadataAlternates(rawLocale),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<LocaleLayoutParams>;
}) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  const cookieStore = await cookies();
  const rawTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme: Theme | null = isSupportedTheme(rawTheme) ? rawTheme : null;

  return (
    <html lang={locale} dir={localeDirection(locale)} data-theme={theme ?? undefined}>
      <body>
        <a href="#main-content">{chromeText('skipToContent', locale)}</a>
        <LanguageSwitcher locale={locale} currentPath={`/${locale}`} />
        <ThemeToggle locale={locale} initialTheme={theme} />
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
