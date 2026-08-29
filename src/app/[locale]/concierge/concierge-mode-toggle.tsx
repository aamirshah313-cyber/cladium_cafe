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
 *
 * Step 40: this component now owns the ONE mount-time `GET /api/consent`
 * fetch for the whole page, instead of `ConciergeChat`/`VoicePanel` each
 * independently fetching their own session/CSRF bootstrap. Found via a
 * real, reproduced E2E failure (not caused by this step's own rate-limit/
 * CSP changes): `ConciergeChat` mounts first (the default "Type" mode),
 * fires its own `GET /api/session/csrf`; a guest who immediately taps
 * "Talk" unmounts it before that fetch resolves — the fetch itself is not
 * aborted, only its state update is discarded — while `VoicePanel` mounts
 * and fires its own `GET /api/consent`. Under normal timing whichever
 * response's `Set-Cookie` lands first is irrelevant; under real full-suite
 * load the *stale* `ConciergeChat` response occasionally lands *last*,
 * silently overwriting the browser's session cookie with a session
 * `VoicePanel` never saw — so the CSRF token `VoicePanel` captured no
 * longer matches the active session, and its next mutating call fails
 * `403 FORBIDDEN`. The exact same class of bug Step 39 already fixed
 * *within* `VoicePanel` (two parallel fetches racing) — this is the same
 * race *across* the two sibling components the mode toggle switches
 * between. Fixing it here, at the one place both components are always
 * mounted together, closes it for both modes at once rather than needing
 * a third independent fix inside `ConciergeChat`.
 */

import { useEffect, useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import { ConciergeChat } from './concierge-chat';
import { VoicePanel } from './voice-panel';

type ConciergeMode = 'type' | 'talk';

interface ConciergeModeToggleProps {
  readonly locale: Locale;
}

interface ConsentGetResponseBody {
  readonly consent: Readonly<Record<'MICROPHONE', { readonly granted: boolean }>>;
  readonly csrfToken: string;
}

export function ConciergeModeToggle({ locale }: ConciergeModeToggleProps) {
  const [mode, setMode] = useState<ConciergeMode>('type');
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [microphoneConsent, setMicrophoneConsent] = useState<boolean | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/consent')
      .then((response) => {
        if (!response.ok) throw new Error('consent fetch failed');
        return response.json();
      })
      .then((body: ConsentGetResponseBody) => {
        if (cancelled) return;
        setCsrfToken(body.csrfToken);
        setMicrophoneConsent(body.consent.MICROPHONE.granted);
      })
      .catch(() => {
        if (cancelled) return;
        setMicrophoneConsent(false);
        setBootstrapError('Could not start a session. Please reload the page.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGrantMicrophoneConsent() {
    if (!csrfToken) return;
    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'MICROPHONE',
          granted: true,
          source: 'voice_panel',
          csrfToken,
        }),
      });
      if (response.ok) setMicrophoneConsent(true);
    } catch {
      // Leave microphoneConsent as-is; the Allow button remains available to retry.
    }
  }

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

      {bootstrapError ? (
        <p role="alert" aria-live="assertive">
          {bootstrapError}
        </p>
      ) : null}

      {mode === 'type' ? (
        <ConciergeChat locale={locale} csrfToken={csrfToken} />
      ) : (
        <VoicePanel
          locale={locale}
          csrfToken={csrfToken}
          microphoneConsent={microphoneConsent}
          onGrantMicrophoneConsent={() => void handleGrantMicrophoneConsent()}
        />
      )}
    </div>
  );
}
