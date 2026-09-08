import { describe, expect, it } from 'vitest';
import { getVenueInfo } from '../../src/modules/concierge/tools/get-venue-info';
import { buildWhatsAppUrl } from '../../src/lib/business/whatsapp-link';
import { resolveLocalizedText } from '../../src/lib/i18n/localized-text';
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
} from '../../src/modules/business/facts';

// A Tuesday inside 12pm-12am Asia/Karachi.
const OPEN_NOW = new Date('2026-08-25T10:00:00Z'); // 15:00 PKT
// Well outside 12pm-12am Asia/Karachi.
const CLOSED_NOW = new Date('2026-08-25T05:00:00Z'); // 10:00 PKT

describe('getVenueInfo — HOURS', () => {
  it('reports the approved hours string and live open status', () => {
    expect(getVenueInfo({ topic: 'HOURS' }, 'en', OPEN_NOW)).toEqual({
      topic: 'HOURS',
      hours: BUSINESS_HOURS_DISPLAY,
      openNow: true,
    });
  });

  it('reports closed outside the approved hours', () => {
    const result = getVenueInfo({ topic: 'HOURS' }, 'en', CLOSED_NOW);
    if (result.topic !== 'HOURS') throw new Error('expected HOURS');
    expect(result.openNow).toBe(false);
  });
});

describe('getVenueInfo — DIRECTIONS', () => {
  it('returns the approved directions/address/map URL', () => {
    expect(getVenueInfo({ topic: 'DIRECTIONS' }, 'en')).toEqual({
      topic: 'DIRECTIONS',
      directions: resolveLocalizedText(DIRECTIONS_TEXT, 'en'),
      address: ADDRESS_DISPLAY,
      mapUrl: GOOGLE_MAPS_URL,
    });
  });
});

describe('getVenueInfo — CONTACT', () => {
  it('returns the official WhatsApp number and the Step 35 hardened link, per locale', () => {
    expect(getVenueInfo({ topic: 'CONTACT' }, 'en')).toEqual({
      topic: 'CONTACT',
      whatsappNumber: WHATSAPP_DISPLAY,
      whatsappUrl: buildWhatsAppUrl('en'),
    });
    expect(getVenueInfo({ topic: 'CONTACT' }, 'ur')).toEqual({
      topic: 'CONTACT',
      whatsappNumber: WHATSAPP_DISPLAY,
      whatsappUrl: buildWhatsAppUrl('ur'),
    });
  });
});

describe('getVenueInfo — policy topics', () => {
  it('SEATING matches modules/business/facts.ts exactly', () => {
    expect(getVenueInfo({ topic: 'SEATING' }, 'en')).toEqual({
      topic: 'SEATING',
      policy: resolveLocalizedText(SEATING_POLICY_TEXT, 'en'),
    });
  });

  it('DELIVERY matches modules/business/facts.ts exactly', () => {
    expect(getVenueInfo({ topic: 'DELIVERY' }, 'en')).toEqual({
      topic: 'DELIVERY',
      policy: resolveLocalizedText(DELIVERY_POLICY_TEXT, 'en'),
    });
  });

  it('BIRTHDAY_DECOR matches modules/business/facts.ts exactly', () => {
    expect(getVenueInfo({ topic: 'BIRTHDAY_DECOR' }, 'en')).toEqual({
      topic: 'BIRTHDAY_DECOR',
      policy: resolveLocalizedText(BIRTHDAY_POLICY_TEXT, 'en'),
    });
  });

  it('CAKES matches modules/business/facts.ts exactly', () => {
    expect(getVenueInfo({ topic: 'CAKES' }, 'en')).toEqual({
      topic: 'CAKES',
      policy: resolveLocalizedText(CAKE_POLICY_TEXT, 'en'),
    });
  });

  it('OUTSIDE_FOOD matches modules/business/facts.ts exactly', () => {
    expect(getVenueInfo({ topic: 'OUTSIDE_FOOD' }, 'en')).toEqual({
      topic: 'OUTSIDE_FOOD',
      policy: resolveLocalizedText(OUTSIDE_FOOD_POLICY_TEXT, 'en'),
    });
  });
});

describe('getVenueInfo — locale resolution', () => {
  /*
   * The concierge answers an Urdu speaker in Urdu, but only from text an
   * owner approved.
   *
   * This test used to assert that both locales returned the *same* English
   * string, with a comment explaining that no approved Urdu existed yet. It
   * was checking a fact about the data, not a rule about the tool, so it
   * started failing the moment the owner approved the seating policy —
   * failing on the desired outcome rather than on a defect.
   *
   * What the tool must actually guarantee is asserted instead: it returns
   * exactly what `resolveLocalizedText` resolves for the requested locale,
   * and never anything of its own. That holds whether or not a translation
   * exists, so approving the remaining policies cannot break it either.
   */
  it('returns the owner-approved Urdu for an Urdu request, verbatim', () => {
    expect(getVenueInfo({ topic: 'SEATING' }, 'ur')).toEqual({
      topic: 'SEATING',
      policy: resolveLocalizedText(SEATING_POLICY_TEXT, 'ur'),
    });
  });

  it('leaves the English answer untouched', () => {
    expect(getVenueInfo({ topic: 'SEATING' }, 'en')).toEqual({
      topic: 'SEATING',
      policy: SEATING_POLICY_TEXT.en,
    });
  });

  /*
   * The concierge must never synthesise a translation of its own. Every
   * locale it can be asked for has to resolve to one of the two strings the
   * approved record holds — never a third one.
   */
  it('answers only from the approved record, in either locale', () => {
    // Compared as whole results rather than by reaching for .policy, which
    // does not exist on every variant of the GetVenueInfoResult union.
    const approved = [SEATING_POLICY_TEXT.en, SEATING_POLICY_TEXT.ur].map((policy) => ({
      topic: 'SEATING',
      policy,
    }));
    for (const locale of ['en', 'ur'] as const) {
      expect(approved).toContainEqual(getVenueInfo({ topic: 'SEATING' }, locale));
    }
  });
});
