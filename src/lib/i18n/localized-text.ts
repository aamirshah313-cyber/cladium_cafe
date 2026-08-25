/**
 * LocalizedText resolver — design/localization-and-rtl.md "Content approval
 * model".
 *
 * Canonical English is the source of truth. Urdu is displayed only when a
 * human reviewer has approved it; otherwise the canonical English value is
 * returned unchanged. This is the only place authoritative business/menu/
 * policy text should be resolved to a display string — never a machine
 * translation, and never a client-side fallback that could show unreviewed
 * text before a check completes.
 */

import type { Locale } from './locale';

export type UrduReviewStatus = 'missing' | 'draft' | 'owner_approved';

export interface LocalizedText {
  readonly en: string;
  readonly ur: string | null;
  readonly urStatus: UrduReviewStatus;
  readonly sourceLanguage: 'en';
}

/** No Urdu translation exists yet. Renders as English in both locales. */
export function canonicalLocalizedText(en: string): LocalizedText {
  return { en, ur: null, urStatus: 'missing', sourceLanguage: 'en' };
}

/** A human-authored Urdu candidate awaiting owner review. Still renders as English until approved. */
export function draftLocalizedText(en: string, ur: string): LocalizedText {
  return { en, ur, urStatus: 'draft', sourceLanguage: 'en' };
}

/** Owner/fluent-reviewer approved Urdu, safe to publish. */
export function ownerApprovedLocalizedText(en: string, ur: string): LocalizedText {
  return { en, ur, urStatus: 'owner_approved', sourceLanguage: 'en' };
}

/**
 * Resolves the text to display for a locale. Urdu is returned only when
 * `urStatus` is `owner_approved` and a value is present; every other case —
 * missing, draft, or English itself — falls back to the unchanged canonical
 * English string.
 */
export function resolveLocalizedText(text: LocalizedText, locale: Locale): string {
  if (locale === 'ur' && text.urStatus === 'owner_approved' && text.ur !== null) {
    return text.ur;
  }
  return text.en;
}
