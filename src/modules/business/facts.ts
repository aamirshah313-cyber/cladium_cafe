/**
 * Approved static business facts — Runbook Step 15.
 *
 * Transcribed once from `cladium-research/data/business-profile.json`
 * (confirmed by a Cladium representative, 2026-08-21), the same way
 * `lib/i18n/chrome.ts` transcribes reviewed UI copy rather than reading a
 * research file into the runtime bundle. Displayed identically in both
 * locales, un-translated — like prices and phone numbers,
 * `design/localization-and-rtl.md` treats configured numerals/times as
 * "preserve original configured values," and an address/hours string is
 * exactly that kind of authoritative content: it needs an owner-reviewed
 * Urdu translation before publication, not a machine-invented one.
 *
 * Long-term, opening hours belong to the `business_hours` table
 * (`supabase/migrations/20260824120001_*`) once an admin surface can edit
 * them (Phase 4+). Until then, this confirmed static value is the only
 * approved source — there is no seeded row to read yet.
 */

export const BUSINESS_HOURS_DISPLAY = '12 pm – 12 am';
