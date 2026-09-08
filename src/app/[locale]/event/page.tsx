/**
 * Birthday/event enquiry page — Runbook Step 23.
 *
 * Surfaces the approved décor/cake/outside-food wording from
 * `modules/business/facts.ts` above the form itself — the runbook requires
 * this flow to carry that wording, not just accept a décor-interest flag.
 * Reuses the same `resolveLocalizedText` pattern as `visit/page.tsx`: the
 * canonical English prose renders in both locales until an owner approves
 * Urdu, never a machine translation.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { localePageMetadata } from '../../../lib/i18n/metadata';
import { resolveLocalizedText } from '../../../lib/i18n/localized-text';
import {
  BIRTHDAY_POLICY_TEXT,
  CAKE_POLICY_TEXT,
  OUTSIDE_FOOD_POLICY_TEXT,
} from '../../../modules/business/facts';
import { venueMedia } from '../../../modules/brand/media-manifest';
import { LocalizedProse } from '../localized-prose';
import { SitePhoto } from '../site-photo';
import { EventForm } from './event-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) return {};
  return localePageMetadata(rawLocale, '/event', 'eventPageHeading', 'eventMetaDescription');
}

export default async function EventPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  const policies = [BIRTHDAY_POLICY_TEXT, CAKE_POLICY_TEXT, OUTSIDE_FOOD_POLICY_TEXT];

  return (
    <div>
      <div className="page-header">
        <h1>{chromeText('eventPageHeading', locale)}</h1>
        <p className="u-lede">{chromeText('eventPageLede', locale)}</p>
      </div>

      <div className="form-layout">
        <div className="panel">
          <EventForm locale={locale} />
        </div>

        {/*
         * The décor, cake and outside-food positions are approved
         * operational answers and are rendered verbatim. They stay beside
         * the form rather than below it so a guest reads them before
         * describing an occasion that might depend on them — and they are
         * never rewritten into an inclusions list or a package.
         */}
        <aside className="panel" aria-labelledby="event-good-to-know-heading">
          {/*
           * The terrace under its own string lights — an evening at
           * Cladium as it already is, not a decorated party. A photograph
           * of a set-up celebration here would imply an arrangement is
           * included, which the approved policy (décor *from* PKR 8,000,
           * final quote and availability staff-confirmed) explicitly does
           * not say.
           */}
          <SitePhoto asset={venueMedia.terraceStringLightsNight} className="panel-photo" />
          <h2
            id="event-good-to-know-heading"
            className="u-display"
            style={{ fontSize: 'var(--step-h3)' }}
          >
            {chromeText('goodToKnowHeading', locale)}
          </h2>
          <ul className="fact-list">
            {policies.map((policy) => (
              <li key={policy.en}>
                <LocalizedProse text={policy} locale={locale} as="span" />
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
