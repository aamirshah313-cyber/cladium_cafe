import { describe, expect, it } from 'vitest';
import {
  signLocalePreference,
  serializeLocalePreferenceCookie,
} from '../../src/lib/i18n/preference-cookie';
import {
  buildLocalePreferenceRedirect,
  negotiateRequestLocale,
} from '../../src/lib/i18n/request-locale';

const SECRET = { SESSION_SECRET: 'test-secret-value-at-least-32-bytes-long' };

function cookieHeaderFor(locale: 'en' | 'ur'): string {
  const token = signLocalePreference(locale, SECRET.SESSION_SECRET);
  return serializeLocalePreferenceCookie(token).split(';')[0] ?? '';
}

describe('negotiateRequestLocale', () => {
  it('falls back to DEFAULT_LOCALE with no cookie and no Accept-Language', () => {
    expect(
      negotiateRequestLocale({ headers: {}, acceptLanguageHeader: null, secretSource: SECRET }),
    ).toBe('en');
  });

  it('uses Accept-Language when there is no cookie', () => {
    expect(
      negotiateRequestLocale({
        headers: {},
        acceptLanguageHeader: 'ur-PK,en;q=0.5',
        secretSource: SECRET,
      }),
    ).toBe('ur');
  });

  it('prefers a verified cookie over a conflicting Accept-Language header', () => {
    expect(
      negotiateRequestLocale({
        headers: { cookie: cookieHeaderFor('ur') },
        acceptLanguageHeader: 'en',
        secretSource: SECRET,
      }),
    ).toBe('ur');
  });

  it('falls back to Accept-Language when the cookie signature is invalid', () => {
    const forged = cookieHeaderFor('ur').replace(/\.[^.]+$/, '.forged-signature');
    expect(
      negotiateRequestLocale({
        headers: { cookie: forged },
        acceptLanguageHeader: 'en',
        secretSource: SECRET,
      }),
    ).toBe('en');
  });

  it('falls back to Accept-Language, without throwing, when SESSION_SECRET is unavailable', () => {
    expect(
      negotiateRequestLocale({
        headers: { cookie: cookieHeaderFor('ur') },
        acceptLanguageHeader: 'en',
        secretSource: {},
      }),
    ).toBe('en');
  });
});

describe('buildLocalePreferenceRedirect', () => {
  it('signs a cookie for a supported requested locale and redirects to the swapped path', () => {
    const result = buildLocalePreferenceRedirect({
      requestedLocale: 'ur',
      requestedPath: '/en/menu',
      secure: true,
      secretSource: SECRET,
    });
    expect(result.locale).toBe('ur');
    expect(result.target).toBe('/ur/menu');
    expect(result.setCookieHeader).toContain('Secure');
    expect(result.setCookieHeader).toContain('HttpOnly');
  });

  it('falls back to DEFAULT_LOCALE for an unsupported requested locale', () => {
    const result = buildLocalePreferenceRedirect({
      requestedLocale: 'fr',
      requestedPath: '/en/menu',
      secure: true,
      secretSource: SECRET,
    });
    expect(result.locale).toBe('en');
    expect(result.target).toBe('/en/menu');
  });

  it('falls back to the target locale root for an unsafe requested path', () => {
    const result = buildLocalePreferenceRedirect({
      requestedLocale: 'ur',
      requestedPath: '//evil.example/phish',
      secure: true,
      secretSource: SECRET,
    });
    expect(result.target).toBe('/ur');
  });

  it('still redirects, without a Set-Cookie header, when SESSION_SECRET is unavailable', () => {
    const result = buildLocalePreferenceRedirect({
      requestedLocale: 'ur',
      requestedPath: '/en/menu',
      secure: true,
      secretSource: {},
    });
    expect(result.target).toBe('/ur/menu');
    expect(result.setCookieHeader).toBeNull();
  });

  it('omits Secure on an insecure (local development) request', () => {
    const result = buildLocalePreferenceRedirect({
      requestedLocale: 'en',
      requestedPath: '/ur',
      secure: false,
      secretSource: SECRET,
    });
    expect(result.setCookieHeader).not.toContain('Secure');
  });
});
