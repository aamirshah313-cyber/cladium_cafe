import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  consentCategorySchema,
  guestNameSchema,
  idempotencyKeySchema,
  integerPkrSchema,
  localeSchema,
  notesSchema,
  phoneSchema,
  preferencesSchema,
  quantitySchema,
  seatingPreferenceSchema,
} from '../../src/lib/schemas/common';
import { parseAtBoundary, parseJsonBody, toFieldIssues } from '../../src/lib/schemas/parse';

describe('primitive schemas', () => {
  it('accepts both launch locales and rejects others', () => {
    expect(localeSchema.safeParse('en').success).toBe(true);
    expect(localeSchema.safeParse('ur').success).toBe(true);
    expect(localeSchema.safeParse('fr').success).toBe(false);
  });

  it('requires integer PKR amounts', () => {
    expect(integerPkrSchema.safeParse(1399).success).toBe(true);
    expect(integerPkrSchema.safeParse(0).success).toBe(true);
    expect(integerPkrSchema.safeParse(1399.5).success).toBe(false);
    expect(integerPkrSchema.safeParse(-1).success).toBe(false);
  });

  it('accepts exactly the four distinct consent categories and rejects any other value (Step 36)', () => {
    for (const category of ['ESSENTIAL_PREFERENCES', 'META_MARKETING', 'MICROPHONE', 'RECORDING']) {
      expect(consentCategorySchema.safeParse(category).success).toBe(true);
    }
    expect(consentCategorySchema.safeParse('MARKETING').success).toBe(false);
    expect(consentCategorySchema.safeParse('essential_preferences').success).toBe(false);
  });

  it('bounds quantities to a sane range', () => {
    expect(quantitySchema.safeParse(1).success).toBe(true);
    expect(quantitySchema.safeParse(0).success).toBe(false);
    expect(quantitySchema.safeParse(100).success).toBe(false);
  });

  it('validates Pakistani mobile numbers in local and international form', () => {
    expect(phoneSchema.safeParse('+92 300 5669359').success).toBe(true);
    expect(phoneSchema.safeParse('03005669359').success).toBe(true);
    expect(phoneSchema.safeParse('+1 555 0100').success).toBe(false);
    expect(phoneSchema.safeParse('not a phone').success).toBe(false);
  });

  it('caps notes length', () => {
    expect(notesSchema.safeParse('a'.repeat(500)).success).toBe(true);
    expect(notesSchema.safeParse('a'.repeat(501)).success).toBe(false);
  });

  it('bounds guest names', () => {
    expect(guestNameSchema.safeParse('Ali').success).toBe(true);
    expect(guestNameSchema.safeParse('A').success).toBe(false);
    expect(guestNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });

  it('requires URL-safe idempotency keys of sufficient length', () => {
    expect(idempotencyKeySchema.safeParse('a'.repeat(16)).success).toBe(true);
    expect(idempotencyKeySchema.safeParse('short').success).toBe(false);
    expect(idempotencyKeySchema.safeParse(`${'a'.repeat(16)} spaced`).success).toBe(false);
  });

  it('restricts seating preference to the two supported options', () => {
    expect(seatingPreferenceSchema.safeParse('GENERAL').success).toBe(true);
    expect(seatingPreferenceSchema.safeParse('TREEHOUSE').success).toBe(true);
    expect(seatingPreferenceSchema.safeParse('ROOFTOP').success).toBe(false);
  });
});

describe('parseAtBoundary', () => {
  const schema = z.strictObject({
    name: guestNameSchema,
    quantity: quantitySchema,
  });

  it('returns ok with parsed data for valid input', () => {
    const result = parseAtBoundary(schema, { name: 'Ali Raza', quantity: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ name: 'Ali Raza', quantity: 2 });
  });

  it('rejects unknown fields rather than silently dropping them', () => {
    const result = parseAtBoundary(schema, {
      name: 'Ali Raza',
      quantity: 2,
      isAdmin: true,
      price: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.issues?.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('reports field paths but never the rejected values', () => {
    const result = parseAtBoundary(schema, { name: 'A', quantity: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const serialized = JSON.stringify(result.error);
      expect(result.error.issues?.map((i) => i.path).sort()).toEqual(['name', 'quantity']);
      expect(serialized).not.toContain('999');
      expect(serialized).not.toContain('"A"');
    }
  });

  it('does not leak PII from a rejected phone number into the error', () => {
    const phoneForm = z.strictObject({ phone: phoneSchema });
    const result = parseAtBoundary(phoneForm, { phone: '+92 300 5669359 extra' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.error)).not.toContain('5669359');
    }
  });

  it('attaches the correlation id when supplied', () => {
    const correlationId = '00000000-0000-4000-8000-000000000000';
    const result = parseAtBoundary(schema, {}, correlationId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.correlationId).toBe(correlationId);
  });

  it('rejects a nested unknown key', () => {
    const nested = z.strictObject({ prefs: preferencesSchema });
    const result = parseAtBoundary(nested, { prefs: { locale: 'en', theme: 'day', extra: 1 } });
    expect(result.ok).toBe(false);
  });
});

describe('parseJsonBody', () => {
  const schema = z.strictObject({ locale: localeSchema });

  it('parses a valid JSON body', async () => {
    const request = { json: async () => ({ locale: 'ur' }) };
    const result = await parseJsonBody(schema, request);
    expect(result.ok).toBe(true);
  });

  it('treats malformed JSON as a validation failure, not a crash', async () => {
    const request = {
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    };
    const result = await parseJsonBody(schema, request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.issues?.[0]?.code).toBe('invalid_json');
    }
  });
});

describe('toFieldIssues', () => {
  it('labels a root-level failure', () => {
    const parsed = z.strictObject({ a: z.string() }).safeParse('not an object');
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(toFieldIssues(parsed.error)[0]?.path).toBe('(root)');
    }
  });
});
