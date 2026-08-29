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

import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { buildWhatsAppUrl } from '../../../lib/business/whatsapp-link';
import { ConsentPreferences } from './consent-preferences';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  return (
    <div>
      <h1>{chromeText('privacyPageHeading', locale)}</h1>

      <section aria-labelledby="privacy-notice-heading">
        <h2 id="privacy-notice-heading">{chromeText('privacyNoticeUnavailableHeading', locale)}</h2>
        <p>{chromeText('privacyNoticeUnavailableBody', locale)}</p>
        <p>
          <a href={buildWhatsAppUrl(locale)} target="_blank" rel="noopener noreferrer">
            {chromeText('whatsappCtaLabel', locale)}
          </a>
          <br />
          <small>{chromeText('whatsappExternalNoticeText', locale)}</small>
        </p>
      </section>

      <ConsentPreferences locale={locale} />
    </div>
  );
}
