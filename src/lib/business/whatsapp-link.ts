/**
 * Hardened click-to-WhatsApp link builder — Runbook Step 35.
 *
 * `> Harden the official click-to-WhatsApp handoff with clear consent and
 * minimal prefilled non-sensitive context` and `release-gates-v2.md` Gate 8:
 * "Click-to-WhatsApp uses the verified business number and avoids exposing
 * customer data in a prefilled URL unless the guest explicitly chooses it."
 *
 * This function takes only a `Locale` — never a guest message, cart, order,
 * or booking detail — so the resulting `?text=` content is structurally
 * incapable of carrying PII or any other guest-supplied data. The message
 * itself is static, reviewed, bilingual UI chrome
 * (`chromeText('whatsappPrefilledMessage', locale)`), the same convention
 * `lib/i18n/chrome.ts` uses for every other piece of interface copy — not a
 * business fact requiring owner-approved-Urdu gating, since it is generic,
 * guest-neutral courtesy text, not a menu/price/policy claim.
 *
 * `WHATSAPP_URL` itself (the verified business number) is untouched —
 * `modules/business/facts.ts` remains the single source of truth for it,
 * and every existing test asserting its exact value keeps passing.
 */

import { chromeText } from '../i18n/chrome';
import type { Locale } from '../i18n/locale';
import { WHATSAPP_URL } from '../../modules/business/facts';

export function buildWhatsAppUrl(locale: Locale): string {
  const message = chromeText('whatsappPrefilledMessage', locale);
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}
