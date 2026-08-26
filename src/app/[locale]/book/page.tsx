/**
 * Booking/treehouse request page — Runbook Step 22.
 *
 * `?seating=treehouse` (from the "Request Treehouse Seating" CTA) only sets
 * the form's initial radio selection — the guest can still change it, and
 * treehouse capacity is staff-confirmed either way (`business/facts.ts`
 * SEATING_POLICY_TEXT). No other query params are trusted as form state.
 */

import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { BookingForm } from './booking-form';

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
      <h1>{chromeText('bookPageHeading', locale)}</h1>
      <BookingForm locale={locale} initialSeatingPreference={initialSeatingPreference} />
    </div>
  );
}
