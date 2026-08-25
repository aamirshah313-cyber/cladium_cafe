/**
 * Approved static business facts — Runbook Steps 15–16.
 *
 * Transcribed once from `cladium-research/data/business-profile.json` and
 * `agent/approved-operations-knowledge.md` (both confirmed by a Cladium
 * representative, 2026-08-21), the same way `lib/i18n/chrome.ts` transcribes
 * reviewed UI copy rather than reading a research file into the runtime
 * bundle.
 *
 * Numerals, the address, and contact identifiers (hours, phone/WhatsApp
 * number, the map URL) render identically in both locales, un-translated —
 * `design/localization-and-rtl.md` treats configured numerals/values as
 * "preserve original configured values," the same rule that protects prices
 * and phone numbers from transformation. Policy *prose* is different: it is
 * authoritative content that needs an owner-reviewed Urdu translation before
 * publication, so those fields are `LocalizedText` via
 * `canonicalLocalizedText` (`ur: null`, `urStatus: 'missing'`) — `en` renders
 * in both locales until an owner approves Urdu, never a machine translation.
 *
 * Long-term, hours/location/contact belong to the `business_settings`/
 * `business_hours` tables (`supabase/migrations/20260824120001_*`) once an
 * admin surface can edit them (Phase 4+). Until then, these confirmed static
 * values are the only approved source — there is no seeded row to read yet.
 */

import { canonicalLocalizedText, type LocalizedText } from '../../lib/i18n/localized-text';

export const BUSINESS_HOURS_DISPLAY = '12 pm – 12 am';

export const ADDRESS_DISPLAY =
  "Opposite Old McDonald's Site, Tarhana Bala, Mansehra Road, Abbottabad, 22010, Pakistan";

export const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/rHvGG5a82LGkTLLY6?g_st=ic';

export const WHATSAPP_DISPLAY = '+92 312 3978889';
export const WHATSAPP_URL = 'https://wa.me/923123978889';

/** approved-operations-knowledge.md: "Where are you located?" */
export const DIRECTIONS_TEXT: LocalizedText = canonicalLocalizedText(
  "In Tarhana. The access road is opposite the old McDonald's site; Cladium Café & Resort is around 1.4 km from there.",
);

/** approved-operations-knowledge.md: "Do you have seating?" */
export const SEATING_POLICY_TEXT: LocalizedText = canonicalLocalizedText(
  'General seating capacity is ample. Treehouse capacity is limited and must be confirmed by staff.',
);

/** approved-operations-knowledge.md: "Do you offer home delivery?" */
export const DELIVERY_POLICY_TEXT: LocalizedText = canonicalLocalizedText(
  'We do not currently offer home delivery. We do offer takeaway from the café.',
);

/** approved-operations-knowledge.md: "Can I celebrate a birthday there?" */
export const BIRTHDAY_POLICY_TEXT: LocalizedText = canonicalLocalizedText(
  'Décor is available for birthdays and events, starting from PKR 8,000. Final price and availability are confirmed by staff.',
);

/** approved-operations-knowledge.md: "Do you provide cakes?" */
export const CAKE_POLICY_TEXT: LocalizedText = canonicalLocalizedText(
  'The café does not provide cakes.',
);

/** approved-operations-knowledge.md: "Can I bring an outside cake or other food?" */
export const OUTSIDE_FOOD_POLICY_TEXT: LocalizedText = canonicalLocalizedText(
  'Outside food is not allowed.',
);
