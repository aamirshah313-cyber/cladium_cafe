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

import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { localePageMetadata } from '../../../lib/i18n/metadata';
import { isOpenAt } from '../../../lib/business/hours';
import { buildWhatsAppUrl } from '../../../lib/business/whatsapp-link';
import { venueHero } from '../../../modules/brand/asset-manifest';
import { LocalizedProse } from '../localized-prose';
import { TrackedWhatsAppLink } from '../tracked-whatsapp-link';
import { MapEmbed } from './map-embed';
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) return {};
  return localePageMetadata(rawLocale, '/visit', 'visitPageHeading', 'visitMetaDescription');
}

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
      <div className="page-header">
        <h1>{chromeText('visitPageHeading', locale)}</h1>
        <p className="u-lede">{chromeText('visitPageLede', locale)}</p>
      </div>

      {/*
       * The same real garden photograph as the homepage, at a calmer size.
       * It is the only authentic venue image that exists, so it appears
       * here as an arrival image rather than being duplicated into a
       * gallery of crops pretending to be different views. Lazy-loaded:
       * this is not the LCP element on this page.
       */}
      <Image
        /*
         * The full-resolution source, not the 1280px derivative. With the
         * smaller one the optimizer was resolving this box to an 826px
         * candidate for a 1096px slot at 1440px wide - a soft image on the
         * page that is meant to introduce the place. The sizes hint below
         * is the real measured width rather than the container maximum,
         * which is what misled the candidate choice.
         */
        src={venueHero.wide.path}
        alt={venueHero.wide.alt}
        width={venueHero.wide.width}
        height={venueHero.wide.height}
        sizes="(min-width: 1280px) 1100px, 100vw"
        className="visit-image"
        loading="lazy"
        style={{ objectPosition: venueHero.wideSmall.focalPoint }}
      />

      <div className="visit-grid">
        <section className="panel" aria-labelledby="directions-heading">
          <h2 id="directions-heading">{chromeText('directionsHeading', locale)}</h2>
          <LocalizedProse text={DIRECTIONS_TEXT} locale={locale} />
          <dl className="summary-list">
            <dt>{chromeText('addressHeading', locale)}</dt>
            <dd>{ADDRESS_DISPLAY}</dd>
          </dl>
          {/*
           * An on-page map preview that loads only on request, plus the
           * link to the verified listing for anyone who wants directions or
           * would rather not load the embed at all. The link is the part
           * that works without JavaScript.
           */}
          <MapEmbed locale={locale} />
          <div className="form-actions">
            <a
              href={GOOGLE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="u-button u-button--secondary"
            >
              {chromeText('mapCtaLabel', locale)}
            </a>
          </div>
        </section>

        <section className="panel" aria-labelledby="hours-heading">
          <h2 id="hours-heading">{chromeText('hoursLabel', locale)}</h2>
          <p className="visit-hours">{BUSINESS_HOURS_DISPLAY}</p>
          <p className="u-muted">{chromeText(statusKey, locale)}</p>
        </section>

        <section className="panel" aria-labelledby="contact-heading">
          <h2 id="contact-heading">{chromeText('contactHeading', locale)}</h2>
          <p>{WHATSAPP_DISPLAY}</p>
          <div className="form-actions">
            <TrackedWhatsAppLink
              href={buildWhatsAppUrl(locale)}
              eventSourceUrl={`/${locale}/visit`}
              className="u-button u-button--primary"
            >
              {chromeText('whatsappCtaLabel', locale)}
            </TrackedWhatsAppLink>
          </div>
          {/* The external-navigation notice stays visible, not a tooltip. */}
          <p className="field-hint">{chromeText('whatsappExternalNoticeText', locale)}</p>
        </section>
      </div>

      <section className="panel visit-good-to-know" aria-labelledby="good-to-know-heading">
        <h2 id="good-to-know-heading">{chromeText('goodToKnowHeading', locale)}</h2>
        {/* Approved operational answers, rendered verbatim. */}
        <ul className="fact-list">
          {policies.map((policy) => (
            <li key={policy.en}>
              <LocalizedProse text={policy} locale={locale} as="span" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
