import { describe, expect, it } from 'vitest';
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
  WHATSAPP_URL,
} from '../../src/modules/business/facts';

/**
 * Transcription-fidelity checks: every value here must match
 * `cladium-research/data/business-profile.json` /
 * `agent/approved-operations-knowledge.md` exactly, since this module is a
 * one-time hand transcription (see its own doc comment) with nothing
 * downstream re-validating it against the source.
 */
describe('approved business facts — exact transcription', () => {
  it('hours', () => {
    expect(BUSINESS_HOURS_DISPLAY).toBe('12 pm – 12 am');
  });

  it('address', () => {
    expect(ADDRESS_DISPLAY).toBe(
      "Opposite Old McDonald's Site, Tarhana Bala, Mansehra Road, Abbottabad, 22010, Pakistan",
    );
  });

  it('Google Maps URL, exactly the confirmed link', () => {
    expect(GOOGLE_MAPS_URL).toBe('https://maps.app.goo.gl/rHvGG5a82LGkTLLY6?g_st=ic');
  });

  it('WhatsApp number and URL, consistent with each other', () => {
    expect(WHATSAPP_DISPLAY).toBe('+92 312 3978889');
    expect(WHATSAPP_URL).toBe('https://wa.me/923123978889');
  });
});

describe('approved business facts — no invented Urdu', () => {
  const policyTexts = [
    DIRECTIONS_TEXT,
    SEATING_POLICY_TEXT,
    DELIVERY_POLICY_TEXT,
    BIRTHDAY_POLICY_TEXT,
    CAKE_POLICY_TEXT,
    OUTSIDE_FOOD_POLICY_TEXT,
  ];

  it.each(policyTexts.map((text) => [text.en, text] as const))(
    'renders %s as canonical English only, pending owner review',
    (_label, text) => {
      expect(text.urStatus).toBe('missing');
      expect(text.ur).toBeNull();
      expect(text.sourceLanguage).toBe('en');
    },
  );

  it('never promises more than the approved décor floor price', () => {
    expect(BIRTHDAY_POLICY_TEXT.en).toContain('starting from PKR 8,000');
    expect(BIRTHDAY_POLICY_TEXT.en).not.toMatch(/\bPKR\s*(?!8,000)\d/);
  });

  it('never claims home delivery is available', () => {
    expect(DELIVERY_POLICY_TEXT.en).toMatch(/do not currently offer home delivery/i);
  });
});
