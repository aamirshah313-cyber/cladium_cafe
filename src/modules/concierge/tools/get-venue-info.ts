/**
 * `getVenueInfo` read tool — Runbook Step 26 (`agent/tool-contracts.md`:
 * "Must read only from approved business profile/operations knowledge").
 *
 * Every value comes from `modules/business/facts.ts` — the same constants
 * `visit/page.tsx` renders — resolved for the caller's locale via
 * `resolveLocalizedText` exactly as that page does, so the concierge can
 * never say something the guest-facing site itself wouldn't show. `HOURS`
 * additionally reports live open/closed status (`lib/business/hours.ts`),
 * timezone-aware, the same computation `SiteFooter` uses. `CONTACT`'s
 * `whatsappUrl` is the same Step 35 hardened link the guest-facing pages
 * use (`lib/business/whatsapp-link.ts`'s `buildWhatsAppUrl`) — a minimal,
 * non-sensitive, reviewed bilingual prefilled message, never guest data.
 */

import { isOpenAt } from '../../../lib/business/hours';
import { buildWhatsAppUrl } from '../../../lib/business/whatsapp-link';
import { resolveLocalizedText } from '../../../lib/i18n/localized-text';
import type { Locale } from '../../../lib/i18n/locale';
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
} from '../../business/facts';
import type { GetVenueInfoInput } from '../schemas';

export type GetVenueInfoResult =
  | { readonly topic: 'HOURS'; readonly hours: string; readonly openNow: boolean }
  | {
      readonly topic: 'DIRECTIONS';
      readonly directions: string;
      readonly address: string;
      readonly mapUrl: string;
    }
  | { readonly topic: 'CONTACT'; readonly whatsappNumber: string; readonly whatsappUrl: string }
  | { readonly topic: 'SEATING'; readonly policy: string }
  | { readonly topic: 'DELIVERY'; readonly policy: string }
  | { readonly topic: 'BIRTHDAY_DECOR'; readonly policy: string }
  | { readonly topic: 'CAKES'; readonly policy: string }
  | { readonly topic: 'OUTSIDE_FOOD'; readonly policy: string };

export function getVenueInfo(
  input: GetVenueInfoInput,
  locale: Locale,
  now: Date = new Date(),
): GetVenueInfoResult {
  switch (input.topic) {
    case 'HOURS':
      return { topic: 'HOURS', hours: BUSINESS_HOURS_DISPLAY, openNow: isOpenAt(now) };
    case 'DIRECTIONS':
      return {
        topic: 'DIRECTIONS',
        directions: resolveLocalizedText(DIRECTIONS_TEXT, locale),
        address: ADDRESS_DISPLAY,
        mapUrl: GOOGLE_MAPS_URL,
      };
    case 'CONTACT':
      return {
        topic: 'CONTACT',
        whatsappNumber: WHATSAPP_DISPLAY,
        whatsappUrl: buildWhatsAppUrl(locale),
      };
    case 'SEATING':
      return { topic: 'SEATING', policy: resolveLocalizedText(SEATING_POLICY_TEXT, locale) };
    case 'DELIVERY':
      return { topic: 'DELIVERY', policy: resolveLocalizedText(DELIVERY_POLICY_TEXT, locale) };
    case 'BIRTHDAY_DECOR':
      return {
        topic: 'BIRTHDAY_DECOR',
        policy: resolveLocalizedText(BIRTHDAY_POLICY_TEXT, locale),
      };
    case 'CAKES':
      return { topic: 'CAKES', policy: resolveLocalizedText(CAKE_POLICY_TEXT, locale) };
    case 'OUTSIDE_FOOD':
      return {
        topic: 'OUTSIDE_FOOD',
        policy: resolveLocalizedText(OUTSIDE_FOOD_POLICY_TEXT, locale),
      };
  }
}
