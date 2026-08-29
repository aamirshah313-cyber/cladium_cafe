'use client';

/**
 * Consent grant/revoke controls — Runbook Step 36.
 *
 * Fetches `GET /api/consent` on mount for the session's current
 * per-category snapshot plus a CSRF token, then `POST /api/consent` on
 * every toggle — same fetch-then-mutate shape as `voice-panel.tsx`
 * (Step 33), the established pattern for a client island with no React
 * testing library in this project (verified live in the browser instead).
 * `ESSENTIAL_PREFERENCES` renders as "Always on" with no button — Step
 * 36's own default (`modules/consent/policy.ts`) makes it non-optional,
 * since disabling it would break the language/theme switcher every guest
 * already relies on.
 */

import { useEffect, useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';

type ConsentCategory = 'ESSENTIAL_PREFERENCES' | 'META_MARKETING' | 'MICROPHONE' | 'RECORDING';

interface ConsentCategoryState {
  readonly category: ConsentCategory;
  readonly granted: boolean;
  readonly policyVersion: string;
  readonly recordedAt: string | null;
  readonly stale: boolean;
}

type ConsentSnapshot = Readonly<Record<ConsentCategory, ConsentCategoryState>>;

interface ConsentGetResponseBody {
  readonly consent: ConsentSnapshot;
  readonly csrfToken: string;
}

interface ConsentPostResponseBody {
  readonly consent: ConsentSnapshot;
}

const CATEGORY_ORDER: readonly ConsentCategory[] = [
  'ESSENTIAL_PREFERENCES',
  'META_MARKETING',
  'MICROPHONE',
  'RECORDING',
];

const LABEL_KEY: Readonly<
  Record<
    ConsentCategory,
    | 'consentEssentialLabel'
    | 'consentMetaMarketingLabel'
    | 'consentMicrophoneLabel'
    | 'consentRecordingLabel'
  >
> = {
  ESSENTIAL_PREFERENCES: 'consentEssentialLabel',
  META_MARKETING: 'consentMetaMarketingLabel',
  MICROPHONE: 'consentMicrophoneLabel',
  RECORDING: 'consentRecordingLabel',
};

const DESCRIPTION_KEY: Readonly<
  Record<
    ConsentCategory,
    | 'consentEssentialDescription'
    | 'consentMetaMarketingDescription'
    | 'consentMicrophoneDescription'
    | 'consentRecordingDescription'
  >
> = {
  ESSENTIAL_PREFERENCES: 'consentEssentialDescription',
  META_MARKETING: 'consentMetaMarketingDescription',
  MICROPHONE: 'consentMicrophoneDescription',
  RECORDING: 'consentRecordingDescription',
};

interface ConsentPreferencesProps {
  readonly locale: Locale;
}

export function ConsentPreferences({ locale }: ConsentPreferencesProps) {
  const [snapshot, setSnapshot] = useState<ConsentSnapshot | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<ConsentCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/consent')
      .then((response) => {
        if (!response.ok) throw new Error('consent fetch failed');
        return response.json();
      })
      .then((body: ConsentGetResponseBody) => {
        if (cancelled) return;
        setSnapshot(body.consent);
        setCsrfToken(body.csrfToken);
      })
      .catch(() => {
        if (!cancelled)
          setError('Could not load your consent preferences. Please reload the page.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setConsent(category: ConsentCategory, granted: boolean) {
    if (!csrfToken) return;
    setPendingCategory(category);
    setError(null);
    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, granted, source: 'privacy_page', csrfToken }),
      });
      if (!response.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }
      const body = (await response.json()) as ConsentPostResponseBody;
      setSnapshot(body.consent);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPendingCategory(null);
    }
  }

  if (!snapshot) {
    return error ? (
      <p role="alert" aria-live="assertive">
        {error}
      </p>
    ) : null;
  }

  return (
    <div>
      <h2>{chromeText('consentPreferencesHeading', locale)}</h2>
      <p>{chromeText('consentPreferencesIntro', locale)}</p>
      <ul>
        {CATEGORY_ORDER.map((category) => {
          const state = snapshot[category];
          const isEssential = category === 'ESSENTIAL_PREFERENCES';
          return (
            <li key={category}>
              <strong>{chromeText(LABEL_KEY[category], locale)}</strong>
              <p>{chromeText(DESCRIPTION_KEY[category], locale)}</p>
              {isEssential ? (
                <span>{chromeText('consentAlwaysOnLabel', locale)}</span>
              ) : (
                <>
                  <span>
                    {chromeText(
                      state.granted ? 'consentGrantedStatusLabel' : 'consentNotGrantedStatusLabel',
                      locale,
                    )}
                  </span>
                  {state.stale ? (
                    <p role="status">{chromeText('consentStaleNotice', locale)}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void setConsent(category, !state.granted)}
                    disabled={!csrfToken || pendingCategory === category}
                  >
                    {chromeText(
                      state.granted ? 'consentRevokeButtonLabel' : 'consentGrantButtonLabel',
                      locale,
                    )}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
