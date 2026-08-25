/**
 * Locale layout — Runbook Step 13.
 *
 * Renders the real document shell (`<html>`/`<body>`) for every localized
 * route, with `lang`/`dir` derived from the validated route segment — never
 * guessed or defaulted silently: an unsupported segment 404s instead of
 * rendering with a wrong document language. `app/layout.tsx` above this is
 * a redirect-only placeholder (see its own doc comment); `proxy.ts`
 * keeps a bare, localeless route from reaching a bare, unlocalized page in
 * the common case.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import '../globals.css';
import { chromeText } from '../../lib/i18n/chrome';
import { LOCALES, isSupportedLocale, localeDirection } from '../../lib/i18n/locale';
import { localeMetadataAlternates } from '../../lib/i18n/metadata';
import { LanguageSwitcher } from './language-switcher';

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

  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <body>
        <a href="#main-content">{chromeText('skipToContent', locale)}</a>
        <LanguageSwitcher locale={locale} currentPath={`/${locale}`} />
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
