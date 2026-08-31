import { describe, expect, it } from 'vitest';
import {
  staffMfaEnrollVerifyBodySchema,
  staffSignInMfaBodySchema,
  staffSignInPasswordBodySchema,
  staffSignInRealBodySchema,
} from '../../src/modules/staff/schemas';

describe('staffSignInRealBodySchema', () => {
  it('accepts a valid password-mode body', () => {
    const result = staffSignInRealBodySchema.safeParse({
      mode: 'password',
      email: 'owner@example.com',
      password: 'test-password-fixture-value',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid mfa-mode body', () => {
    const result = staffSignInRealBodySchema.safeParse({ mode: 'mfa', code: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects a body with neither mode value', () => {
    expect(staffSignInRealBodySchema.safeParse({ mode: 'bogus' }).success).toBe(false);
  });

  it('rejects an unrecognized field (strict object)', () => {
    const result = staffSignInPasswordBodySchema.safeParse({
      mode: 'password',
      email: 'owner@example.com',
      password: 'x'.repeat(12),
      extra: 'not allowed',
    });
    expect(result.success).toBe(false);
  });
});

describe('staffSignInPasswordBodySchema', () => {
  it('rejects a malformed email', () => {
    expect(
      staffSignInPasswordBodySchema.safeParse({
        mode: 'password',
        email: 'not-an-email',
        password: 'x',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(
      staffSignInPasswordBodySchema.safeParse({ mode: 'password', email: 'a@b.com', password: '' })
        .success,
    ).toBe(false);
  });
});

describe('staffSignInMfaBodySchema', () => {
  it('accepts exactly 6 digits', () => {
    expect(staffSignInMfaBodySchema.safeParse({ mode: 'mfa', code: '000000' }).success).toBe(true);
  });
});

describe('staffMfaEnrollVerifyBodySchema', () => {
  it('accepts exactly 6 digits', () => {
    expect(staffMfaEnrollVerifyBodySchema.safeParse({ code: '000000' }).success).toBe(true);
  });

  it('rejects a code with fewer than 6 digits', () => {
    expect(staffMfaEnrollVerifyBodySchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('rejects a code with more than 6 digits', () => {
    expect(staffMfaEnrollVerifyBodySchema.safeParse({ code: '1234567' }).success).toBe(false);
  });

  it('rejects a code with non-digit characters', () => {
    expect(staffMfaEnrollVerifyBodySchema.safeParse({ code: '12345a' }).success).toBe(false);
  });

  it('trims surrounding whitespace before validating', () => {
    const result = staffMfaEnrollVerifyBodySchema.safeParse({ code: ' 123456 ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe('123456');
  });
});
