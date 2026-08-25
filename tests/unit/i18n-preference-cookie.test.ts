import { describe, expect, it } from 'vitest';
import {
  localeCookieName,
  readLocalePreferenceToken,
  serializeLocalePreferenceCookie,
  signLocalePreference,
  verifyLocalePreference,
} from '../../src/lib/i18n/preference-cookie';

const SECRET = 'test-secret-value-not-used-in-production';
const OTHER_SECRET = 'a-different-secret-entirely';

describe('signLocalePreference / verifyLocalePreference (cookie signature)', () => {
  it('round-trips a signed locale back to the original locale', () => {
    const token = signLocalePreference('ur', SECRET);
    const result = verifyLocalePreference(token, SECRET);
    expect(result).toEqual({ ok: true, value: 'ur' });
  });

  it('rejects a value signed with a different secret', () => {
    const token = signLocalePreference('en', OTHER_SECRET);
    const result = verifyLocalePreference(token, SECRET);
    expect(result).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('rejects a tampered locale with a signature that no longer matches it', () => {
    const token = signLocalePreference('en', SECRET);
    const [, signature] = token.split('.');
    const tampered = `ur.${signature}`;
    const result = verifyLocalePreference(tampered, SECRET);
    expect(result).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('rejects a malformed token with no separator', () => {
    expect(verifyLocalePreference('not-a-valid-token', SECRET)).toEqual({
      ok: false,
      error: 'MALFORMED',
    });
  });

  it('rejects a token naming an unsupported locale even with a correctly shaped signature', () => {
    expect(verifyLocalePreference('fr.somesignature', SECRET)).toEqual({
      ok: false,
      error: 'MALFORMED',
    });
  });

  it('rejects an empty signature', () => {
    expect(verifyLocalePreference('en.', SECRET)).toEqual({ ok: false, error: 'MALFORMED' });
  });
});

describe('serializeLocalePreferenceCookie / readLocalePreferenceToken', () => {
  it('serializes a secure cookie with hardened attributes', () => {
    const token = signLocalePreference('en', SECRET);
    const header = serializeLocalePreferenceCookie(token);
    expect(header).toContain(`${localeCookieName(true)}=${token}`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
  });

  it('omits Secure for insecure (local development) cookies', () => {
    const token = signLocalePreference('en', SECRET);
    const header = serializeLocalePreferenceCookie(token, { secure: false });
    expect(header).toContain(`${localeCookieName(false)}=${token}`);
    expect(header).not.toContain('Secure');
  });

  it('reads back a token from a Cookie request header', () => {
    const token = signLocalePreference('ur', SECRET);
    const header = serializeLocalePreferenceCookie(token);
    const cookieValue = header.split(';')[0];
    const read = readLocalePreferenceToken({ cookie: cookieValue });
    expect(read).toBe(token);
    expect(verifyLocalePreference(read ?? '', SECRET)).toEqual({ ok: true, value: 'ur' });
  });

  it('returns undefined when the locale cookie is absent', () => {
    expect(readLocalePreferenceToken({ cookie: 'other=value' })).toBeUndefined();
    expect(readLocalePreferenceToken(undefined)).toBeUndefined();
  });
});
