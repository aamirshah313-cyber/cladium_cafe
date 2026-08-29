import { describe, expect, it } from 'vitest';
import { trackMetaEventBodySchema } from '../../src/modules/integrations/meta-schemas';

const VALID = { eventName: 'view_menu', eventSourceUrl: '/en/menu', csrfToken: 'a'.repeat(20) };

describe('trackMetaEventBodySchema', () => {
  it('accepts a valid body with an eventSourceUrl', () => {
    expect(trackMetaEventBodySchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts a valid body with eventSourceUrl omitted', () => {
    const { eventSourceUrl: _omit, ...rest } = VALID;
    expect(trackMetaEventBodySchema.safeParse(rest).success).toBe(true);
  });

  it('rejects an unknown eventName', () => {
    expect(trackMetaEventBodySchema.safeParse({ ...VALID, eventName: 'purchase' }).success).toBe(
      false,
    );
  });

  it('rejects an eventSourceUrl carrying a query string', () => {
    expect(
      trackMetaEventBodySchema.safeParse({ ...VALID, eventSourceUrl: '/en/menu?ref=abc' }).success,
    ).toBe(false);
  });

  it('rejects an eventSourceUrl that is a full URL rather than a relative path', () => {
    expect(
      trackMetaEventBodySchema.safeParse({
        ...VALID,
        eventSourceUrl: 'https://evil.example/en/menu',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields (strict object)', () => {
    expect(
      trackMetaEventBodySchema.safeParse({ ...VALID, guestPhone: '+92 300 1234567' }).success,
    ).toBe(false);
  });

  it('requires a csrfToken', () => {
    const { csrfToken: _omit, ...rest } = VALID;
    expect(trackMetaEventBodySchema.safeParse(rest).success).toBe(false);
  });
});
