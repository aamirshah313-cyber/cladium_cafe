/**
 * Locale layout — Runbook Steps 13–15.
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
 *
 * `SiteHeader`/`SiteFooter` are the mobile-first site shell (Step 15);
 * `#main-content` is the skip link's target.
 *
 * `resolvePageMetaPixelId` decides whether `MetaPixelBootstrap` renders at
 * all — Step 37 follow-up. Reads the guest's session cookie read-only
 * (`readVerifiedSessionId`, never mints one — a Server Component cannot
 * attach a `Set-Cookie` header to its own render); no valid session yet
 * means no consent could ever have been recorded, so the pixel correctly
 * stays absent for a first-time visitor, same as any other guest who has
 * never interacted with a session-minting route. Any misconfiguration
 * (`SESSION_SECRET`/`NEXT_PUBLIC_APP_URL` unset) fails closed to "no
 * pixel," never a crashed page — this must never be the thing that takes
 * the whole site shell down.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import '../globals.css';
import { LOCALES, isSupportedLocale, localeDirection } from '../../lib/i18n/locale';
import { localeMetadataAlternates } from '../../lib/i18n/metadata';
import { THEME_COOKIE_NAME } from '../../lib/theme/preference-cookie';
import { isSupportedTheme, type Theme } from '../../lib/theme/theme';
import { readVerifiedSessionId } from '../../lib/customer-session';
import { sessionCookieName } from '../../lib/security/session';
import { parseAppUrl } from '../../lib/env';
import { isFeatureEnabled, parseMetaPixelId, parseSessionSecret } from '../../lib/env.server';
import { hasConsent } from '../../modules/consent/consent-service';
import { consentDeps } from '../../modules/consent/deps';
import { resolveMetaPixelId } from '../../modules/integrations/meta-pixel';
import { MetaPixelBootstrap } from './meta-pixel-bootstrap';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

async function resolvePageMetaPixelId(cookieStore: {
  get: (name: string) => { readonly value: string } | undefined;
}): Promise<string | null> {
  let secret: string;
  let secure: boolean;
  try {
    secret = parseSessionSecret();
    secure = new URL(parseAppUrl()).protocol === 'https:';
  } catch {
    return null;
  }

  const sessionId = readVerifiedSessionId({
    existingToken: cookieStore.get(sessionCookieName(secure))?.value,
    secret,
  });

  return resolveMetaPixelId(
    {
      isFeatureEnabled: () => isFeatureEnabled('FEATURE_META_MARKETING'),
      pixelId: () => parseMetaPixelId(),
      hasConsent: (id) => hasConsent(consentDeps, id, 'META_MARKETING'),
    },
    sessionId,
  );
}

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
  const metaPixelId = await resolvePageMetaPixelId(cookieStore);

  return (
    <html lang={locale} dir={localeDirection(locale)} data-theme={theme ?? undefined}>
      <body>
        {metaPixelId ? <MetaPixelBootstrap pixelId={metaPixelId} /> : null}
        <SiteHeader locale={locale} initialTheme={theme} />
        <main id="main-content">{children}</main>
        <SiteFooter locale={locale} />
      </body>
    </html>
  );
}
