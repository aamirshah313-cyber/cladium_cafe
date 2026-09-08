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
 * publication, so those fields are `LocalizedText` rather than bare strings.
 *
 * The owner reviewed and approved the Urdu for every policy below, so they
 * are now `ownerApprovedLocalizedText` and Urdu renders on Urdu pages. The
 * approval is what changed — not the rule. Any *new* policy string still
 * starts as `canonicalLocalizedText` and shows English in both locales until
 * it has been through the same review; a machine translation must never be
 * promoted straight to approved.
 *
 * The numerals inside the Urdu are deliberately untouched: PKR 8,000 and
 * 1.4 km appear exactly as in the English, per the
 * "preserve original configured values" rule above.
 *
 * Long-term, hours/location/contact belong to the `business_settings`/
 * `business_hours` tables (`supabase/migrations/20260824120001_*`) once an
 * admin surface can edit them (Phase 4+). Until then, these confirmed static
 * values are the only approved source — there is no seeded row to read yet.
 */

import { ownerApprovedLocalizedText, type LocalizedText } from '../../lib/i18n/localized-text';

export const BUSINESS_HOURS_DISPLAY = '12 pm – 12 am';

export const ADDRESS_DISPLAY =
  "Opposite Old McDonald's Site, Tarhana Bala, Mansehra Road, Abbottabad, 22010, Pakistan";

export const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/rHvGG5a82LGkTLLY6?g_st=ic';

/**
 * The venue's confirmed coordinates, transcribed from
 * `business-profile.json`'s `coordinates` block — the same approved source
 * as the address and hours above, not read off a map by eye.
 *
 * Used to build the embedded map's `q=` parameter. The short
 * `GOOGLE_MAPS_URL` above stays the canonical "open in Google Maps"
 * destination for anyone who wants directions; these are only for framing
 * the on-page preview at the right place.
 */
export const MAP_LATITUDE = 34.2406216;
export const MAP_LONGITUDE = 73.2544366;

export const WHATSAPP_DISPLAY = '+92 312 3978889';
export const WHATSAPP_URL = 'https://wa.me/923123978889';

/**
 * The café's official social profiles. Facebook and Instagram were opened
 * and visually confirmed as Cladium's own during the 5 September 2026
 * design audit (`design/LUXURY_REDESIGN_AUDIT_AND_PLAN.md`); the TikTok
 * handle was supplied directly by the owner afterwards.
 *
 * Links only. Nothing on the site embeds a live social feed, hotlinks a
 * social CDN URL (those expire), or republishes a collaborator's or a
 * visitor's post as Cladium-owned media.
 *
 * Two items the audit recorded for owner verification, deliberately NOT
 * acted on here because inference is not confirmation: the WhatsApp number
 * above opens a profile displaying the name "Mehran", and the Google Maps
 * listing shows a different public phone number than the WhatsApp one. The
 * configured values stay exactly as approved until the owner confirms.
 */
export const FACEBOOK_URL = 'https://www.facebook.com/people/CladiumCafeResort/61590768862564/';
export const INSTAGRAM_URL = 'https://www.instagram.com/cladium.cafe/';
export const TIKTOK_URL = 'https://www.tiktok.com/@cladium_cafe';
// Guest-facing click-to-WhatsApp links use `lib/business/whatsapp-link.ts`'s
// `buildWhatsAppUrl(locale)` (Step 35), which appends a minimal, reviewed,
// non-sensitive prefilled `?text=` message to this same verified URL —
// never this bare constant directly.

/** approved-operations-knowledge.md: "Where are you located?" */
export const DIRECTIONS_TEXT: LocalizedText = ownerApprovedLocalizedText(
  "In Tarhana. The access road is opposite the old McDonald's site; Cladium Café & Resort is around 1.4 km from there.",
  'تڑھانہ میں۔ راستہ پرانے میکڈونلڈز سائٹ کے سامنے سے جاتا ہے؛ وہاں سے کلیڈیم کیفے اینڈ ریزورٹ تقریباً 1.4 کلومیٹر کے فاصلے پر ہے۔',
);

/** approved-operations-knowledge.md: "Do you have seating?" */
export const SEATING_POLICY_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'General seating capacity is ample. Treehouse capacity is limited and must be confirmed by staff.',
  'عام نشستوں کی گنجائش وافر ہے۔ ٹری ہاؤس کی گنجائش محدود ہے اور اس کی تصدیق عملے سے ضروری ہے۔',
);

/** approved-operations-knowledge.md: "Do you offer home delivery?" */
export const DELIVERY_POLICY_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'We do not currently offer home delivery. We do offer takeaway from the café.',
  'ہم فی الحال ہوم ڈیلیوری فراہم نہیں کرتے۔ البتہ کیفے سے ٹیک اوے دستیاب ہے۔',
);

/** approved-operations-knowledge.md: "Can I celebrate a birthday there?" */
export const BIRTHDAY_POLICY_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'Décor is available for birthdays and events, starting from PKR 8,000. Final price and availability are confirmed by staff.',
  'سالگرہ اور تقریبات کے لیے ڈیکور دستیاب ہے، جو PKR 8,000 سے شروع ہوتا ہے۔ حتمی قیمت اور دستیابی کی تصدیق عملہ کرتا ہے۔',
);

/** approved-operations-knowledge.md: "Do you provide cakes?" */
export const CAKE_POLICY_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'The café does not provide cakes.',
  'کیفے کیک فراہم نہیں کرتا۔',
);

/** approved-operations-knowledge.md: "Can I bring an outside cake or other food?" */
export const OUTSIDE_FOOD_POLICY_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'Outside food is not allowed.',
  'باہر کا کھانا لانے کی اجازت نہیں ہے۔',
);
