/**
 * Home page — Runbook Step 16, CTAs extended in Steps 22–23 and 28.
 *
 * Deliberately modest: `design/site-map.md`'s "Taste" (menu teaser) and
 * atmospheric "Arrival"/"Place" photography are not built here — no menu
 * adapter is wired to a route yet (Step 17), and no photography is approved
 * yet (`.continuum/PROJECT_STATE.md` production blockers), so this stays
 * truthful and text-only rather than filling either gap with a placeholder.
 * The WhatsApp link uses `target="_blank" rel="noopener noreferrer"`, same
 * reasoning as `visit/page.tsx`.
 *
 * The CTAs match CLAUDE.md's request-accurate CTA list and site-map.md's
 * "Action: Order, book, or continue the conversation" — "Request Treehouse
 * Seating" only pre-selects the seating radio via `?seating=treehouse`
 * (capacity is still staff-confirmed either way), and "Plan a Birthday"
 * links to the event/décor enquiry flow, never promising a quote.
 */

import { notFound } from 'next/navigation';
import { BRAND_NAME, TAGLINE, chromeText } from '../../lib/i18n/chrome';
import { isSupportedLocale } from '../../lib/i18n/locale';
import { WHATSAPP_URL } from '../../modules/business/facts';

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  return (
    <>
      <h1>{BRAND_NAME}</h1>
      <p>{TAGLINE}</p>
      <p>{chromeText('homeIntro', locale)}</p>
      <p>
        <a href={`/${locale}/book`}>{chromeText('navBookLabel', locale)}</a>
      </p>
      <p>
        <a href={`/${locale}/book?seating=treehouse`}>
          {chromeText('treehouseSeatingCtaLabel', locale)}
        </a>
      </p>
      <p>
        <a href={`/${locale}/event`}>{chromeText('navPlanBirthdayLabel', locale)}</a>
      </p>
      <p>
        <a href={`/${locale}/visit`}>{chromeText('homeVisitCtaLabel', locale)}</a>
      </p>
      <p>
        <a href={`/${locale}/concierge`}>{chromeText('navConciergeLabel', locale)}</a>
      </p>
      <p>
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
          {chromeText('whatsappCtaLabel', locale)}
        </a>
      </p>
    </>
  );
}
