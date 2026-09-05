/**
 * Privacy page — Runbook Step 36.
 *
 * "Add owner-approved privacy/retention/deletion content... Hide
 * unapproved legal pages." No privacy notice/retention schedule has owner/
 * legal sign-off yet (`release-gates-v2.md` Gate 0's own unchecked bullet;
 * `production-architecture-v2.md` §12: "Hide unavailable legal/social-proof
 * pages rather than publishing placeholders"). This page never invents
 * that content — it shows the same honest "not published yet" pattern
 * `menu/page.tsx` established for the unapproved menu (Step 17, D-021),
 * with a WhatsApp fallback for privacy questions in the meantime.
 *
 * The actual consent grant/revoke mechanism (`consent-preferences.tsx`)
 * is real and fully working today — it is not gated on owner content the
 * way the notice prose above it is; a guest can manage every category
 * right now regardless of whether the full written notice exists yet.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { localePageMetadata } from '../../../lib/i18n/metadata';
import { buildWhatsAppUrl } from '../../../lib/business/whatsapp-link';
import { ConsentPreferences } from './consent-preferences';
import { TrackedWhatsAppLink } from '../tracked-whatsapp-link';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) return {};
  return localePageMetadata(rawLocale, '/privacy', 'privacyPageHeading', 'privacyMetaDescription');
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  return (
    <div className="reading">
      <div className="page-header">
        <h1>{chromeText('privacyPageHeading', locale)}</h1>
      </div>

      {/* The unpublished-policy notice keeps its honest status and stays
          the first thing on the page — it is not softened, hidden behind a
          disclosure, or replaced with placeholder legal text. */}
      <section className="panel" aria-labelledby="privacy-notice-heading">
        <h2 id="privacy-notice-heading">{chromeText('privacyNoticeUnavailableHeading', locale)}</h2>
        <p>{chromeText('privacyNoticeUnavailableBody', locale)}</p>
        <p>
          <TrackedWhatsAppLink
            href={buildWhatsAppUrl(locale)}
            eventSourceUrl={`/${locale}/privacy`}
          >
            {chromeText('whatsappCtaLabel', locale)}
          </TrackedWhatsAppLink>
          <br />
          <small className="u-muted">{chromeText('whatsappExternalNoticeText', locale)}</small>
        </p>
      </section>

      <ConsentPreferences locale={locale} />
    </div>
  );
}
