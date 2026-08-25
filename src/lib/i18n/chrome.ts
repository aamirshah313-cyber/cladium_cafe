/**
 * Reviewed application chrome translations.
 *
 * design/localization-and-rtl.md: "UI chrome uses reviewed application
 * translations" — distinct from business/menu/policy content, which must go
 * through the owner-approval workflow in `localized-text.ts` instead. These
 * are static interface strings only (navigation, structural labels); no
 * business fact, price, policy, or promotional claim belongs in this file.
 *
 * The brand name is never translated or transliterated (localization-and-
 * rtl.md: "The brand name Cladium Café & Resort remains unchanged").
 */

import type { Locale } from './locale';

export interface ChromeCopy {
  readonly en: string;
  readonly ur: string;
}

export const BRAND_NAME = 'Cladium Café & Resort';

export const chrome = {
  skipToContent: { en: 'Skip to content', ur: 'مرکزی مواد پر جائیں' },
  languageSwitcherLabel: { en: 'Language', ur: 'زبان' },
  englishLanguageName: { en: 'English', ur: 'انگریزی' },
  urduLanguageName: { en: 'Urdu', ur: 'اردو' },
  homeIntro: {
    en: 'A luxury café and resort experience.',
    ur: 'ایک شاندار کیفے اور ریزورٹ کا تجربہ۔',
  },
} as const satisfies Record<string, ChromeCopy>;

export type ChromeKey = keyof typeof chrome;

export function chromeText(key: ChromeKey, locale: Locale): string {
  return chrome[key][locale];
}
