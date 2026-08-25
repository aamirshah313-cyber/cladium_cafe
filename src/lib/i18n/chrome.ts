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
  themeSwitcherLabel: { en: 'Theme', ur: 'تھیم' },
  dayThemeName: { en: 'Day', ur: 'دن' },
  nightThemeName: { en: 'Night', ur: 'رات' },
  homeIntro: {
    en: 'A luxury café and resort experience.',
    ur: 'ایک شاندار کیفے اور ریزورٹ کا تجربہ۔',
  },
  primaryNavLabel: { en: 'Primary', ur: 'بنیادی' },
  navHomeLabel: { en: 'Home', ur: 'ہوم' },
  hoursLabel: { en: 'Hours', ur: 'اوقات' },
  statusOpenNow: { en: 'Open now', ur: 'ابھی کھلا ہے' },
  statusClosedNow: { en: 'Closed now', ur: 'ابھی بند ہے' },
  loadingLabel: { en: 'Loading…', ur: 'لوڈ ہو رہا ہے…' },
  errorHeading: { en: 'Something went wrong', ur: 'کچھ غلط ہو گیا' },
  errorBody: {
    en: 'Please try again, or return to the home page.',
    ur: 'براہ کرم دوبارہ کوشش کریں، یا ہوم پیج پر واپس جائیں۔',
  },
  errorRetry: { en: 'Try again', ur: 'دوبارہ کوشش کریں' },
  errorHomeLink: { en: 'Go to home page', ur: 'ہوم پیج پر جائیں' },
  notFoundHeading: { en: 'Page not found', ur: 'صفحہ نہیں ملا' },
  notFoundBody: {
    en: "The page you're looking for doesn't exist.",
    ur: 'جو صفحہ آپ تلاش کر رہے ہیں وہ موجود نہیں ہے۔',
  },
} as const satisfies Record<string, ChromeCopy>;

export type ChromeKey = keyof typeof chrome;

export function chromeText(key: ChromeKey, locale: Locale): string {
  return chrome[key][locale];
}
