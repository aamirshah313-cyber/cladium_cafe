import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  isSafeSameSitePath,
  isSupportedLocale,
  localeFromPathname,
  negotiateLocale,
  parseAcceptLanguage,
  swapLocaleInPath,
} from '../../src/lib/i18n/locale';

describe('parseAcceptLanguage', () => {
  it('returns supported locales in descending quality order', () => {
    expect(parseAcceptLanguage('ur;q=0.5, en;q=0.9')).toEqual(['en', 'ur']);
  });

  it('matches a region subtag to its primary language', () => {
    expect(parseAcceptLanguage('ur-PK, en-US;q=0.8')).toEqual(['ur', 'en']);
  });

  it('drops unsupported languages while keeping supported ones', () => {
    expect(parseAcceptLanguage('fr-FR, en;q=0.7, de')).toEqual(['en']);
  });

  it('deduplicates repeated primary subtags', () => {
    expect(parseAcceptLanguage('en-US, en-GB;q=0.9, en;q=0.5')).toEqual(['en']);
  });

  it('drops malformed quality values instead of throwing', () => {
    expect(parseAcceptLanguage('en;q=not-a-number, ur;q=0.5')).toEqual(['ur']);
    expect(parseAcceptLanguage('en;q=2, ur;q=0.5')).toEqual(['ur']);
  });

  it('returns an empty array for a missing or empty header', () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage('')).toEqual([]);
  });
});

describe('negotiateLocale', () => {
  it('prefers a pre-verified cookie locale over Accept-Language', () => {
    expect(negotiateLocale({ verifiedCookieLocale: 'ur', acceptLanguageHeader: 'en' })).toBe('ur');
  });

  it('falls back to Accept-Language when no cookie locale is present', () => {
    expect(negotiateLocale({ acceptLanguageHeader: 'ur, en;q=0.5' })).toBe('ur');
  });

  it('falls back to the default locale when nothing matches', () => {
    expect(negotiateLocale({ acceptLanguageHeader: 'fr-FR' })).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale({})).toBe(DEFAULT_LOCALE);
  });

  it('never returns a value outside the closed locale enum', () => {
    const result = negotiateLocale({
      // @ts-expect-error deliberately passing an unsupported value to prove it is rejected, not trusted
      verifiedCookieLocale: 'fr',
      acceptLanguageHeader: 'fr-FR',
    });
    expect(isSupportedLocale(result)).toBe(true);
  });
});

describe('isSafeSameSitePath (unsafe path rejection)', () => {
  it('accepts a plain relative path', () => {
    expect(isSafeSameSitePath('/en/menu')).toBe(true);
  });

  it('rejects a protocol-relative path used to smuggle an off-site target', () => {
    expect(isSafeSameSitePath('//evil.example/phish')).toBe(false);
  });

  it('rejects a backslash-prefixed path some browsers treat as protocol-relative', () => {
    expect(isSafeSameSitePath('/\\evil.example')).toBe(false);
  });

  it('rejects an absolute URL with a scheme', () => {
    expect(isSafeSameSitePath('https://evil.example/en')).toBe(false);
  });

  it('rejects a path containing control characters', () => {
    expect(isSafeSameSitePath('/en/\x00menu')).toBe(false);
  });

  it('rejects a path that does not start with a slash', () => {
    expect(isSafeSameSitePath('en/menu')).toBe(false);
  });

  it('rejects null, undefined, and empty input', () => {
    expect(isSafeSameSitePath(null)).toBe(false);
    expect(isSafeSameSitePath(undefined)).toBe(false);
    expect(isSafeSameSitePath('')).toBe(false);
  });
});

describe('swapLocaleInPath', () => {
  it('preserves the rest of the path when swapping locales', () => {
    expect(swapLocaleInPath('/en/menu', 'ur')).toBe('/ur/menu');
  });

  it('swaps the locale root itself', () => {
    expect(swapLocaleInPath('/en', 'ur')).toBe('/ur');
  });

  it('falls back to the target locale root for an unsafe input path', () => {
    expect(swapLocaleInPath('//evil.example/phish', 'ur')).toBe('/ur');
    expect(swapLocaleInPath('https://evil.example', 'en')).toBe('/en');
  });

  it('falls back to the target locale root for a path with no locale prefix', () => {
    expect(swapLocaleInPath('/menu', 'ur')).toBe('/ur');
  });

  it('preserves a query string and hash when swapping locales', () => {
    expect(swapLocaleInPath('/en/menu?category=starters#top', 'ur')).toBe(
      '/ur/menu?category=starters#top',
    );
  });

  it('preserves a query string and hash at the locale root when swapping locales', () => {
    expect(swapLocaleInPath('/en?ref=share#top', 'ur')).toBe('/ur?ref=share#top');
  });
});

describe('localeFromPathname', () => {
  it('reads the locale off the leading segment', () => {
    expect(localeFromPathname('/ur')).toBe('ur');
    expect(localeFromPathname('/ur/menu')).toBe('ur');
    expect(localeFromPathname('/en/menu')).toBe('en');
  });

  it('falls back to DEFAULT_LOCALE for a path with no recognized prefix', () => {
    expect(localeFromPathname('/menu')).toBe(DEFAULT_LOCALE);
    expect(localeFromPathname('/')).toBe(DEFAULT_LOCALE);
  });

  it('does not match a locale as a substring of a different segment', () => {
    expect(localeFromPathname('/english-menu')).toBe(DEFAULT_LOCALE);
  });
});
