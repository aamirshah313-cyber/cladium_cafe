'use client';

/**
 * Type/Talk mode switch — Runbook Step 33.
 *
 * A labelled two-button group (never icon-only), the same accessible
 * pattern `theme-toggle.tsx` (Step 14) already uses. Defaults to text
 * ("Type") — the existing, already-launched behaviour for every guest —
 * never auto-switches to voice. Only rendered by `page.tsx` at all when
 * `voiceAvailable` (the requested locale's `FEATURE_VOICE_EN`/
 * `FEATURE_VOICE_UR` flag, resolved server-side) is true — "feature flags
 * remove disabled controls," not merely hide them behind a client check
 * (`release-gates-v2.md` Gate 1).
 */

import { useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import { ConciergeChat } from './concierge-chat';
import { VoicePanel } from './voice-panel';

type ConciergeMode = 'type' | 'talk';

interface ConciergeModeToggleProps {
  readonly locale: Locale;
}

export function ConciergeModeToggle({ locale }: ConciergeModeToggleProps) {
  const [mode, setMode] = useState<ConciergeMode>('type');

  return (
    <div>
      <div role="group" aria-label={chromeText('conciergeModeSwitcherLabel', locale)}>
        <button type="button" aria-pressed={mode === 'type'} onClick={() => setMode('type')}>
          {chromeText('conciergeModeTypeLabel', locale)}
        </button>
        <button type="button" aria-pressed={mode === 'talk'} onClick={() => setMode('talk')}>
          {chromeText('conciergeModeTalkLabel', locale)}
        </button>
      </div>

      {mode === 'type' ? <ConciergeChat locale={locale} /> : <VoicePanel locale={locale} />}
    </div>
  );
}
