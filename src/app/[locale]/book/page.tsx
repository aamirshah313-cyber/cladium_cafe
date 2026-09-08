/**
 * Booking/treehouse request page — Runbook Step 22.
 *
 * `?seating=treehouse` (from the "Request Treehouse Seating" CTA) only sets
 * the form's initial radio selection — the guest can still change it, and
 * treehouse capacity is staff-confirmed either way (`business/facts.ts`
 * SEATING_POLICY_TEXT). No other query params are trusted as form state.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { localePageMetadata } from '../../../lib/i18n/metadata';
import { SEATING_POLICY_TEXT } from '../../../modules/business/facts';
import { venueMedia } from '../../../modules/brand/media-manifest';
import { LocalizedProse } from '../localized-prose';
import { SitePhoto } from '../site-photo';
import { BookingForm } from './booking-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) return {};
  return localePageMetadata(rawLocale, '/book', 'bookPageHeading', 'bookMetaDescription');
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ seating?: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  const { seating } = await searchParams;
  const initialSeatingPreference = seating === 'treehouse' ? 'TREEHOUSE' : 'GENERAL';

  return (
    <div>
      <div className="page-header">
        <h1>{chromeText('bookPageHeading', locale)}</h1>
        <p className="u-lede">{chromeText('bookPageLede', locale)}</p>
      </div>

      {/*
       * The form leads and the explanation sits beside it, so a guest who
       * already knows what they want is not made to read first. On a narrow
       * screen the supporting column falls below the form for the same
       * reason.
       */}
      <div className="form-layout">
        <div className="panel">
          <BookingForm locale={locale} initialSeatingPreference={initialSeatingPreference} />
        </div>

        <aside className="panel" aria-labelledby="book-next-heading">
          {/*
           * Garden seating, captioned as exactly that by its manifest alt
           * text. There is deliberately no treehouse photograph anywhere on
           * this page: none of the supplied frames has been confirmed to
           * show it, and presenting a general garden picture beside a
           * treehouse option would document a space nobody has identified —
           * the same class of invention the seating policy exists to
           * prevent.
           */}
          <SitePhoto asset={venueMedia.lawnChairsPavilion} className="panel-photo" />
          <h2 id="book-next-heading" className="u-display" style={{ fontSize: 'var(--step-h3)' }}>
            {chromeText('bookWhatHappensHeading', locale)}
          </h2>
          <p>{chromeText('bookWhatHappensBody', locale)}</p>
          {/* The approved seating position, verbatim — the treehouse limit
              is never softened by the surrounding design. */}
          <LocalizedProse text={SEATING_POLICY_TEXT} locale={locale} className="u-muted" />
        </aside>
      </div>
    </div>
  );
}
