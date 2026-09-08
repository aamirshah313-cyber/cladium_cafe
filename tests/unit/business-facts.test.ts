import { describe, expect, it } from 'vitest';
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

describe('approved business facts — reviewed Urdu only', () => {
  const policyTexts = [
    DIRECTIONS_TEXT,
    SEATING_POLICY_TEXT,
    DELIVERY_POLICY_TEXT,
    BIRTHDAY_POLICY_TEXT,
    CAKE_POLICY_TEXT,
    OUTSIDE_FOOD_POLICY_TEXT,
  ];

  /*
   * The owner reviewed and approved the Urdu for every policy here, so these
   * now assert the approved state rather than the pending one.
   *
   * Two earlier versions of this block are worth remembering. The first
   * required `urStatus` to be exactly `'missing'`, which also forbade
   * `'draft'` — blocking the review workflow the type system exists to
   * support, and proving only that a field was null rather than that the
   * rendered output was safe. The second checked the resolver, which was
   * the right thing to check but described a state that has now passed.
   *
   * What has to stay true forever is below: English is untouched, Urdu is
   * only ever shown once approved, and the load-bearing numbers survive
   * translation. Nothing here would stop a *new* string being added as
   * canonical English — `resolveLocalizedText` returning `text.en` is
   * correct for that case too.
   */
  it.each(policyTexts.map((text) => [text.en, text] as const))(
    'shows the owner-approved Urdu for %s and leaves the English untouched',
    (_label, text) => {
      expect(text.sourceLanguage).toBe('en');
      expect(resolveLocalizedText(text, 'en')).toBe(text.en);

      if (text.urStatus === 'owner_approved') {
        expect(text.ur).not.toBeNull();
        expect(resolveLocalizedText(text, 'ur')).toBe(text.ur);
        // An approved translation must be real Urdu, not the English copied
        // across — which is the shape a careless "translation" pass leaves.
        expect(text.ur).not.toBe(text.en);
        expect(text.ur).toMatch(/[\u0600-\u06FF]/);
      } else {
        // Anything not yet approved still renders English, whatever it holds.
        expect(resolveLocalizedText(text, 'ur')).toBe(text.en);
      }
    },
  );

  /*
   * Numerals are "preserve original configured values" under
   * design/localization-and-rtl.md, so a translation may not restate a price
   * or a distance in its own words or its own digits. These two carry
   * figures a guest acts on.
   */
  it('carries the décor floor price through the Urdu unchanged', () => {
    expect(BIRTHDAY_POLICY_TEXT.ur).toContain('PKR 8,000');
    expect(BIRTHDAY_POLICY_TEXT.ur).not.toMatch(/\bPKR\s*(?!8,000)\d/);
  });

  it('carries the approach distance through the Urdu unchanged', () => {
    expect(DIRECTIONS_TEXT.ur).toContain('1.4');
  });

  /*
   * The delivery policy is the one that would do real harm if a translation
   * softened it, so the Urdu is checked for the negation particle rather
   * than trusted because the English is correct.
   */
  it('still refuses home delivery in the Urdu', () => {
    expect(DELIVERY_POLICY_TEXT.ur).toContain('نہیں');
  });

  it('never promises more than the approved décor floor price', () => {
    expect(BIRTHDAY_POLICY_TEXT.en).toContain('starting from PKR 8,000');
    expect(BIRTHDAY_POLICY_TEXT.en).not.toMatch(/\bPKR\s*(?!8,000)\d/);
  });

  it('never claims home delivery is available', () => {
    expect(DELIVERY_POLICY_TEXT.en).toMatch(/do not currently offer home delivery/i);
  });
});
