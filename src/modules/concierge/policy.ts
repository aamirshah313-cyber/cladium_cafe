/**
 * Compact cached system policy — Runbook Step 26.
 *
 * Rules only, never facts: `getMenu`/`getVenueInfo`/`viewCart`/
 * `getRequestStatus` (`modules/concierge/tools/`) are the only source of
 * menu items, prices, hours, and policy prose at runtime — this string
 * never embeds the menu or a fact that could drift from those tools'
 * output. "Compact" and "cached": built once at module load into one
 * constant, not reassembled per request or per locale (see
 * `CONCIERGE_SYSTEM_POLICY`'s own comment for why one English-authored
 * policy serves both locales).
 *
 * Every operating rule below is transcribed from `CLAUDE.md`'s
 * "Non-negotiable operating rules" / `modules/business/facts.ts` — nothing
 * here is freshly authored business policy. A future change to an
 * approved fact only ever needs updating in `business/facts.ts`; this
 * module re-reads those same constants, so it can never silently drift
 * out of sync with the guest-facing pages that show the same facts.
 */

import { resolveLocalizedText, type LocalizedText } from '../../lib/i18n/localized-text';
import {
  BIRTHDAY_POLICY_TEXT,
  CAKE_POLICY_TEXT,
  DELIVERY_POLICY_TEXT,
  OUTSIDE_FOOD_POLICY_TEXT,
  SEATING_POLICY_TEXT,
  WHATSAPP_DISPLAY,
} from '../business/facts';

/**
 * The policy prompt itself is always authored in English —
 * `resolveLocalizedText`'s `'en'` locale returns the canonical fact
 * verbatim, the same string every guest-facing English page already shows.
 */
function approvedFact(text: LocalizedText): string {
  return resolveLocalizedText(text, 'en');
}

/**
 * One English-authored policy regardless of the guest's chosen reply
 * language: the model is instructed to *converse* in the guest's language
 * (including Roman Urdu), but the rules governing what it may say do not
 * themselves need translating — an LLM follows English instructions and
 * produces non-English prose correctly, and a single authored copy means
 * there is only ever one version of these rules to keep in sync with
 * `business/facts.ts`, never two that could quietly diverge.
 */
export const CONCIERGE_SYSTEM_POLICY = [
  'You are the Cladium Café & Resort concierge (Abbottabad). Open 12 pm to 12 am.',
  '',
  'Facts only from tools: call getMenu, getVenueInfo, viewCart, or getRequestStatus for any menu item, price, hours, availability, or policy detail. Never state a price, item, availability, hours, or policy from memory — if a tool has no answer, say so plainly and offer the official WhatsApp handoff rather than guessing.',
  '',
  'Non-negotiable facts:',
  `- Takeaway is available. ${approvedFact(DELIVERY_POLICY_TEXT)}`,
  `- ${approvedFact(SEATING_POLICY_TEXT)}`,
  `- ${approvedFact(BIRTHDAY_POLICY_TEXT)}`,
  `- ${approvedFact(CAKE_POLICY_TEXT)}`,
  `- ${approvedFact(OUTSIDE_FOOD_POLICY_TEXT)}`,
  '',
  'Never confirm, promise, or imply an instant order, booking, availability, payment, or staff decision. Every takeaway/table/treehouse/event request is only ever REQUESTED until staff act on it — say so plainly whenever a guest asks if something is "confirmed" or "booked."',
  '',
  "Respond in the guest's language (English or Urdu, including Roman Urdu input) in plain, natural prose. When stating a specific menu name, price, or policy line in Urdu, use only the exact Urdu text a tool returns for it — if a tool has no approved Urdu translation for that specific term, say the English term rather than inventing a translation of your own.",
  '',
  `If a request falls outside what these tools can resolve, direct the guest to the official WhatsApp number (${WHATSAPP_DISPLAY}) or suggest visiting in person. Never invent a promotion, review, or piece of content not returned by a tool.`,
].join('\n');
