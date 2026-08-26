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

import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { resolveLocalizedText } from '../../../lib/i18n/localized-text';
import {
  BIRTHDAY_POLICY_TEXT,
  CAKE_POLICY_TEXT,
  OUTSIDE_FOOD_POLICY_TEXT,
} from '../../../modules/business/facts';
import { EventForm } from './event-form';

export default async function EventPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  const policies = [BIRTHDAY_POLICY_TEXT, CAKE_POLICY_TEXT, OUTSIDE_FOOD_POLICY_TEXT];

  return (
    <div>
      <h1>{chromeText('eventPageHeading', locale)}</h1>

      <section aria-labelledby="event-good-to-know-heading">
        <h2 id="event-good-to-know-heading">{chromeText('goodToKnowHeading', locale)}</h2>
        <ul>
          {policies.map((policy) => (
            <li key={policy.en}>{resolveLocalizedText(policy, locale)}</li>
          ))}
        </ul>
      </section>

      <EventForm locale={locale} />
    </div>
  );
}
