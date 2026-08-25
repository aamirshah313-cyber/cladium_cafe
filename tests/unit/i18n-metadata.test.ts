import { describe, expect, it } from 'vitest';
import { localeMetadataAlternates } from '../../src/lib/i18n/metadata';

describe('localeMetadataAlternates', () => {
  it('builds canonical, en, ur, and x-default alternates for the locale root', () => {
    expect(localeMetadataAlternates('en')).toEqual({
      canonical: '/en',
      languages: { en: '/en', ur: '/ur', 'x-default': '/en' },
    });
  });

  it('uses the requested locale for canonical regardless of which locale is default', () => {
    expect(localeMetadataAlternates('ur')).toEqual({
      canonical: '/ur',
      languages: { en: '/en', ur: '/ur', 'x-default': '/en' },
    });
  });

  it('x-default always points at the default locale, never the requested one', () => {
    const alternates = localeMetadataAlternates('ur');
    expect(alternates.languages['x-default']).toBe('/en');
  });

  it('appends a deeper route path to every alternate consistently', () => {
    expect(localeMetadataAlternates('en', '/menu')).toEqual({
      canonical: '/en/menu',
      languages: { en: '/en/menu', ur: '/ur/menu', 'x-default': '/en/menu' },
    });
  });
});
