/**
 * Renders an approved `LocalizedText` value with honest language markup.
 *
 * `resolveLocalizedText` falls back to canonical English whenever an
 * owner-approved Urdu translation does not exist yet — the deliberate rule
 * from `design/localization-and-rtl.md`, which forbids machine-translating
 * business content to make a screen look finished. What was missing was
 * telling the *browser* that: English prose rendered inside an Urdu
 * document inherited `lang="ur"` and `dir="rtl"`, so a screen reader
 * announced English words with Urdu pronunciation rules and bidirectional
 * reordering applied to a left-to-right sentence.
 *
 * When the fallback is in play this emits `lang="en" dir="ltr"` on the
 * element, which is exactly the "canonical English fallback may remain with
 * correct language/direction markup" the design brief requires. When real
 * approved Urdu is shown, no override is emitted and the text inherits the
 * document's own language and direction.
 */

import type { ElementType } from 'react';
import { resolveLocalizedText, type LocalizedText } from '../../lib/i18n/localized-text';
import type { Locale } from '../../lib/i18n/locale';

interface LocalizedProseProps {
  readonly text: LocalizedText;
  readonly locale: Locale;
  /** Defaults to a paragraph; pass `span` for inline use. */
  readonly as?: ElementType;
  readonly className?: string;
}

export function LocalizedProse({ text, locale, as: Tag = 'p', className }: LocalizedProseProps) {
  const isEnglishFallback =
    locale === 'ur' && !(text.urStatus === 'owner_approved' && text.ur !== null);

  return (
    <Tag
      className={className}
      lang={isEnglishFallback ? 'en' : undefined}
      dir={isEnglishFallback ? 'ltr' : undefined}
    >
      {resolveLocalizedText(text, locale)}
    </Tag>
  );
}
