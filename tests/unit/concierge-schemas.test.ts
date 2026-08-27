import { describe, expect, it } from 'vitest';
import {
  getMenuInputSchema,
  getRequestStatusInputSchema,
  getVenueInfoInputSchema,
  viewCartInputSchema,
} from '../../src/modules/concierge/schemas';

describe('getMenuInputSchema', () => {
  it('accepts an empty object', () => {
    expect(getMenuInputSchema.safeParse({}).success).toBe(true);
  });

  it('accepts each optional field alone', () => {
    expect(getMenuInputSchema.safeParse({ query: 'ribeye' }).success).toBe(true);
    expect(getMenuInputSchema.safeParse({ category: 'steaks' }).success).toBe(true);
    expect(getMenuInputSchema.safeParse({ itemId: 'steaks.ribeye' }).success).toBe(true);
  });

  it('rejects an unknown property — the model cannot smuggle extra fields', () => {
    expect(getMenuInputSchema.safeParse({ query: 'ribeye', extra: 'x' }).success).toBe(false);
  });

  it('rejects a blank query', () => {
    expect(getMenuInputSchema.safeParse({ query: '' }).success).toBe(false);
  });
});

describe('getVenueInfoInputSchema', () => {
  it('accepts every documented topic', () => {
    for (const topic of [
      'HOURS',
      'DIRECTIONS',
      'CONTACT',
      'SEATING',
      'DELIVERY',
      'BIRTHDAY_DECOR',
      'CAKES',
      'OUTSIDE_FOOD',
    ]) {
      expect(getVenueInfoInputSchema.safeParse({ topic }).success).toBe(true);
    }
  });

  it('rejects an undocumented topic — an unlisted fact is a validation failure, not a null result', () => {
    expect(getVenueInfoInputSchema.safeParse({ topic: 'PARKING' }).success).toBe(false);
  });

  it('rejects a missing topic', () => {
    expect(getVenueInfoInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown property', () => {
    expect(getVenueInfoInputSchema.safeParse({ topic: 'HOURS', extra: 'x' }).success).toBe(false);
  });
});

describe('viewCartInputSchema', () => {
  it('accepts an empty object — the model supplies nothing; the server injects the session', () => {
    expect(viewCartInputSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a model-supplied sessionId — never trust a browser/model-supplied session id', () => {
    expect(viewCartInputSchema.safeParse({ sessionId: 'session-1' }).success).toBe(false);
  });
});

describe('getRequestStatusInputSchema', () => {
  it('accepts a well-formed UUID', () => {
    expect(
      getRequestStatusInputSchema.safeParse({ requestId: '123e4567-e89b-12d3-a456-426614174000' })
        .success,
    ).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(getRequestStatusInputSchema.safeParse({ requestId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects a missing requestId', () => {
    expect(getRequestStatusInputSchema.safeParse({}).success).toBe(false);
  });
});
