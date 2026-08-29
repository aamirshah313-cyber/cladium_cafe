'use client';

/**
 * Voice concierge panel — Runbook Step 33.
 *
 * Thin, real-SDK-wiring glue: `@vapi-ai/web` events (`call-start`,
 * `call-end`, `speech-start`/`speech-end`, `message`, `error`,
 * `call-start-failed`) become `dispatch(event)` calls into the pure
 * `voiceCallReducer` (`voice-call-state.ts`) — verified live in the
 * browser, the same way every page component in this codebase has been
 * since Step 13, never a React unit test (none exist in this project).
 *
 * Voice never submits anything itself: a prepared draft
 * (`prepareBookingRequest`/`prepareEventRequest`, executed server-side by
 * `/api/vapi/tools`, Step 32) is picked up by polling `GET /api/vapi/
 * pending-confirmation` and rendered with the exact same
 * `PendingConfirmationCard` text chat uses (`pending-confirmation.tsx`) —
 * the guest must tap Confirm, which calls the real submit endpoint
 * directly, identical to text chat and the manual forms.
 *
 * Recording is never enabled — `vapi-web-client.ts`'s doc comment. Only
 * `transcriptType === 'final'` transcript messages are kept, so the live
 * transcript doesn't flicker through every partial recognition update.
 *
 * Step 36: a call cannot start without MICROPHONE consent. This panel
 * fetches the current grant on mount and shows an inline "Allow
 * microphone access" prompt instead of the Start Call button when it
 * isn't granted yet — but the real enforcement is server-side
 * (`issue-vapi-token.ts` rejects `POST /api/vapi/token` with
 * `CONSENT_REQUIRED` regardless of what this client believes), so a stale
 * or bypassed client state can never actually reach a live call.
 */

import { useEffect, useRef, useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import {
  createVoiceCallClient,
  startVoiceCall,
  type VoiceCallClient,
} from '../../../modules/integrations/vapi-web-client';
import {
  INITIAL_VOICE_CALL_STATE,
  classifyVapiError,
  shouldShowPendingConfirmation,
  voiceCallReducer,
  type VoiceCallEvent,
  type VoiceErrorKind,
} from './voice-call-state';
import {
  PendingConfirmationCard,
  submitPendingConfirmation,
  type PendingConfirmationView,
  type SourceChannel,
} from './pending-confirmation';

interface VoicePanelProps {
  readonly locale: Locale;
}

const POLL_INTERVAL_MS = 3000;

const SOURCE_CHANNEL_BY_LOCALE: Readonly<Record<Locale, SourceChannel>> = {
  en: 'VOICE_EN',
  ur: 'VOICE_UR',
};

const ERROR_CHROME_KEY: Readonly<
  Record<
    VoiceErrorKind,
    | 'voiceErrorPermissionDenied'
    | 'voiceErrorDeviceLost'
    | 'voiceErrorConnectionFailed'
    | 'voiceErrorUnknown'
  >
> = {
  PERMISSION_DENIED: 'voiceErrorPermissionDenied',
  DEVICE_LOST: 'voiceErrorDeviceLost',
  CONNECTION_FAILED: 'voiceErrorConnectionFailed',
  UNKNOWN: 'voiceErrorUnknown',
};

interface VapiTokenResponseBody {
  readonly token: string;
  readonly assistantId: string;
  readonly sessionId: string;
}

interface PendingConfirmationResponseBody {
  readonly pendingConfirmation: PendingConfirmationView | null;
}

interface ConsentGetResponseBody {
  readonly consent: Readonly<Record<'MICROPHONE', { readonly granted: boolean }>>;
  readonly csrfToken: string;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}

/** Best-effort read of `@vapi-ai/web`'s `message` event payload — only `type: 'transcript'`/`'transcript[...]'` with `transcriptType: 'final'` is kept. */
function transcriptEntryFrom(
  message: unknown,
): { role: 'assistant' | 'user'; text: string } | null {
  if (typeof message !== 'object' || message === null) return null;
  const candidate = message as {
    type?: unknown;
    role?: unknown;
    transcriptType?: unknown;
    transcript?: unknown;
  };
  const isTranscriptMessage =
    typeof candidate.type === 'string' && candidate.type.startsWith('transcript');
  if (!isTranscriptMessage) return null;
  if (candidate.transcriptType !== 'final') return null;
  if (typeof candidate.transcript !== 'string' || candidate.transcript.length === 0) return null;
  const role = candidate.role === 'user' ? 'user' : 'assistant';
  return { role, text: candidate.transcript };
}

export function VoicePanel({ locale }: VoicePanelProps) {
  const [state, setState] = useState(INITIAL_VOICE_CALL_STATE);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [microphoneConsent, setMicrophoneConsent] = useState<boolean | null>(null);
  const [pending, setPending] = useState<PendingConfirmationView | null>(null);
  const [confirmedKind, setConfirmedKind] = useState<'BOOKING' | 'EVENT' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const clientRef = useRef<VoiceCallClient | null>(null);
  const lastHandledTokenRef = useRef<string | null>(null);

  function dispatch(event: VoiceCallEvent) {
    setState((prior) => voiceCallReducer(prior, event));
  }

  // One request, not two independent ones: `GET /api/consent` already
  // returns both the current MICROPHONE grant *and* a `csrfToken` for the
  // same resolved session (Step 36). Two separate parallel fetches here —
  // this one plus a `GET /api/session/csrf` — each mint their own fresh
  // session when no cookie exists yet (a guest's very first render, which
  // every fresh browser context/test run is), and whichever response's
  // `Set-Cookie` lands last silently wins; the CSRF token from the other,
  // now-abandoned session would then fail verification on the next
  // mutating request. A real, reproduced bug (Step 39's E2E suite caught
  // it as an intermittent "Start voice call never appears" failure) —
  // fixed by deriving both values from the one request.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/consent')
      .then((response) => {
        if (!response.ok) throw new Error('consent fetch failed');
        return response.json();
      })
      .then((body: ConsentGetResponseBody) => {
        if (cancelled) return;
        setMicrophoneConsent(body.consent.MICROPHONE.granted);
        setCsrfToken(body.csrfToken);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail closed: an unknown consent state is treated as not granted.
        setMicrophoneConsent(false);
        setError('Could not start a session. Please reload the page.');
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

  // Ends any live call if the guest navigates away mid-call.
  useEffect(() => {
    return () => {
      clientRef.current?.stop();
    };
  }, []);

  // Polls for a server-prepared draft while a call is active — the bridge
  // for tool execution that happens entirely server-to-server (Step 32).
  useEffect(() => {
    if (state.status !== 'active') return;
    let cancelled = false;
    const interval = setInterval(() => {
      fetch('/api/vapi/pending-confirmation')
        .then((response) => response.json())
        .then((body: PendingConfirmationResponseBody) => {
          if (cancelled) return;
          const incoming = body.pendingConfirmation ?? null;
          setPending((current) =>
            shouldShowPendingConfirmation(current, incoming, lastHandledTokenRef.current)
              ? incoming
              : current,
          );
        })
        .catch(() => {
          // A missed poll tick is not fatal — the next one retries.
        });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state.status]);

  async function handleStart() {
    if (!csrfToken || microphoneConsent !== true) return;
    setError(null);
    setConfirmedKind(null);
    dispatch({ type: 'START_REQUESTED' });

    try {
      const response = await fetch('/api/vapi/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, csrfToken }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        dispatch({ type: 'ERROR', kind: 'UNKNOWN' });
        return;
      }
      const body = (await response.json()) as VapiTokenResponseBody;

      const client = createVoiceCallClient(body.token);
      clientRef.current = client;
      client.on('call-start', () => dispatch({ type: 'CALL_STARTED' }));
      client.on('call-end', () => dispatch({ type: 'CALL_ENDED' }));
      client.on('speech-start', () => dispatch({ type: 'SPEECH_START', who: 'assistant' }));
      client.on('speech-end', () => dispatch({ type: 'SPEECH_END', who: 'assistant' }));
      client.on('error', (raw) => dispatch({ type: 'ERROR', kind: classifyVapiError(raw) }));
      client.on('call-start-failed', (raw) =>
        dispatch({ type: 'ERROR', kind: classifyVapiError(raw) }),
      );
      client.on('message', (raw) => {
        const entry = transcriptEntryFrom(raw);
        if (entry) dispatch({ type: 'TRANSCRIPT', entry });
      });

      await startVoiceCall(client, { assistantId: body.assistantId, sessionId: body.sessionId });
    } catch (caught) {
      dispatch({ type: 'ERROR', kind: classifyVapiError(caught) });
    }
  }

  function handleEnd() {
    clientRef.current?.stop();
    dispatch({ type: 'CALL_ENDED' });
  }

  async function handleConfirm() {
    if (!pending || !csrfToken) return;
    setSubmitting(true);
    setError(null);

    const result = await submitPendingConfirmation(
      pending,
      csrfToken,
      SOURCE_CHANNEL_BY_LOCALE[locale],
    );
    if (!result.ok) {
      setError(result.error);
    } else {
      lastHandledTokenRef.current = pending.confirmationToken;
      setConfirmedKind(pending.kind);
      setPending(null);
    }
    setSubmitting(false);
  }

  function handleDismiss() {
    if (pending) lastHandledTokenRef.current = pending.confirmationToken;
    setPending(null);
  }

  const canStart = state.status === 'idle' || state.status === 'ended' || state.status === 'error';
  const canEnd = state.status === 'connecting' || state.status === 'active';

  let statusLabel: string | null = null;
  if (state.status === 'connecting') statusLabel = chromeText('voiceStatusConnecting', locale);
  else if (state.status === 'active') {
    statusLabel =
      state.speaking === 'assistant'
        ? chromeText('voiceStatusSpeaking', locale)
        : chromeText('voiceStatusListening', locale);
  } else if (state.status === 'ended') statusLabel = chromeText('voiceStatusEnded', locale);

  return (
    <div>
      <h2>{chromeText('voicePanelHeading', locale)}</h2>
      <p>{chromeText('voicePanelIntro', locale)}</p>
      <p>{chromeText('voiceRecordingNotice', locale)}</p>

      {statusLabel ? (
        <p role="status" aria-live="polite">
          {statusLabel}
        </p>
      ) : null}

      {canStart && microphoneConsent === false ? (
        <div>
          <p>{chromeText('voiceMicrophoneConsentPrompt', locale)}</p>
          <button
            type="button"
            onClick={() => void handleGrantMicrophoneConsent()}
            disabled={!csrfToken}
          >
            {chromeText('voiceMicrophoneConsentAllowLabel', locale)}
          </button>
        </div>
      ) : null}
      {canStart && microphoneConsent === true ? (
        <button type="button" onClick={() => void handleStart()} disabled={!csrfToken}>
          {chromeText('voiceStartCallButtonLabel', locale)}
        </button>
      ) : null}
      {canEnd ? (
        <button type="button" onClick={handleEnd}>
          {chromeText('voiceEndCallButtonLabel', locale)}
        </button>
      ) : null}

      {state.status === 'error' ? (
        <p role="alert" aria-live="assertive">
          {chromeText(ERROR_CHROME_KEY[state.errorKind ?? 'UNKNOWN'], locale)}
        </p>
      ) : null}

      {state.transcript.length > 0 ? (
        <div>
          <h3>{chromeText('voiceTranscriptHeading', locale)}</h3>
          <ul aria-live="polite">
            {state.transcript.map((entry, index) => (
              <li key={index}>
                <strong>{entry.role === 'user' ? '>' : ''}</strong> {entry.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {confirmedKind === 'BOOKING' ? (
        <div role="status">
          <h2>{chromeText('bookConfirmedHeading', locale)}</h2>
          <p>{chromeText('bookConfirmedBody', locale)}</p>
        </div>
      ) : null}
      {confirmedKind === 'EVENT' ? (
        <div role="status">
          <h2>{chromeText('eventConfirmedHeading', locale)}</h2>
          <p>{chromeText('eventConfirmedBody', locale)}</p>
        </div>
      ) : null}

      {pending ? (
        <PendingConfirmationCard
          pending={pending}
          locale={locale}
          submitting={submitting}
          onDismiss={handleDismiss}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}

      {error ? (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
