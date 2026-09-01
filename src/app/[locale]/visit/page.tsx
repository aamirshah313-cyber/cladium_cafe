/**
 * Visit page — Runbook Step 16.
 *
 * Location, directions, hours, contact, and policy facts, matching the
 * single "Visit" node in `design/site-map.md` (Directions/map, Hours,
 * Contact/WhatsApp, garden/family/group-visit details) rather than
 * splitting into separate routes not named there. Every fact here traces to
 * `modules/business/facts.ts` (itself transcribed from
 * `business-profile.json`/`approved-operations-knowledge.md`) — nothing on
 * this page is invented. No photography: none is approved yet (see
 * `.continuum/PROJECT_STATE.md` production blockers), so this stays
 * text-only rather than using a placeholder image.
 *
 * The map and WhatsApp links are the only external links on the site so
 * far: both `target="_blank"` with `rel="noopener noreferrer"` (untrusted
 * external destination — never let it reach back into this tab via
 * `window.opener`). Step 35 hardens the WhatsApp link via
 * `lib/business/whatsapp-link.ts`'s `buildWhatsAppUrl` (a minimal,
 * non-sensitive, reviewed bilingual prefilled message — never guest data)
 * plus a visible external-navigation notice.
 */

import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { resolveLocalizedText } from '../../../lib/i18n/localized-text';
import { isOpenAt } from '../../../lib/business/hours';
import { buildWhatsAppUrl } from '../../../lib/business/whatsapp-link';
import { TrackedWhatsAppLink } from '../tracked-whatsapp-link';
import {
  ADDRESS_DISPLAY,
  BIRTHDAY_POLICY_TEXT,
  BUSINESS_HOURS_DISPLAY,
  CAKE_POLICY_TEXT,
  DELIVERY_POLICY_TEXT,
  DIRECTIONS_TEXT,
  GOOGLE_MAPS_URL,
  OUTSIDE_FOOD_POLICY_TEXT,
  SEATING_POLICY_TEXT,
  WHATSAPP_DISPLAY,
} from '../../../modules/business/facts';

export default async function VisitPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  const open = isOpenAt(new Date());
  const statusKey = open ? 'statusOpenNow' : 'statusClosedNow';
  const policies = [
    SEATING_POLICY_TEXT,
    DELIVERY_POLICY_TEXT,
    BIRTHDAY_POLICY_TEXT,
    CAKE_POLICY_TEXT,
    OUTSIDE_FOOD_POLICY_TEXT,
  ];

  return (
    <div>
      <h1>{chromeText('visitPageHeading', locale)}</h1>

      <section aria-labelledby="directions-heading">
        <h2 id="directions-heading">{chromeText('directionsHeading', locale)}</h2>
        <p>{resolveLocalizedText(DIRECTIONS_TEXT, locale)}</p>
        <p>
          <span>{chromeText('addressHeading', locale)}: </span>
          <span>{ADDRESS_DISPLAY}</span>
        </p>
        <p>
          <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer">
            {chromeText('mapCtaLabel', locale)}
          </a>
        </p>
      </section>

      <section aria-labelledby="hours-heading">
        <h2 id="hours-heading">{chromeText('hoursLabel', locale)}</h2>
        <p>
          <span>{BUSINESS_HOURS_DISPLAY}</span>
          <span> · </span>
          <span>{chromeText(statusKey, locale)}</span>
        </p>
      </section>

      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading">{chromeText('contactHeading', locale)}</h2>
        <p>
          <TrackedWhatsAppLink href={buildWhatsAppUrl(locale)} eventSourceUrl={`/${locale}/visit`}>
            {chromeText('whatsappCtaLabel', locale)}
          </TrackedWhatsAppLink>
          <span> ({WHATSAPP_DISPLAY})</span>
        </p>
        <p>
          <small>{chromeText('whatsappExternalNoticeText', locale)}</small>
        </p>
      </section>

      <section aria-labelledby="good-to-know-heading">
        <h2 id="good-to-know-heading">{chromeText('goodToKnowHeading', locale)}</h2>
        <ul>
          {policies.map((policy) => (
            <li key={policy.en}>{resolveLocalizedText(policy, locale)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
