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
 * shows an inline "Allow microphone access" prompt instead of the Start
 * Call button when it isn't granted yet — but the real enforcement is
 * server-side (`issue-vapi-token.ts` rejects `POST /api/vapi/token` with
 * `CONSENT_REQUIRED` regardless of what this client believes), so a stale
 * or bypassed client state can never actually reach a live call.
 *
 * Step 40: `csrfToken`/`microphoneConsent` are now props, resolved once by
 * the parent `ConciergeModeToggle` (`onGrantMicrophoneConsent` likewise) —
 * this component no longer fetches its own `GET /api/consent` on mount.
 * See `concierge-mode-toggle.tsx`'s doc comment for the real, reproduced
 * cross-component session race this closes (this file's own Step 39 fix
 * closed the *within-component* version of the same race; this is the
 * *cross-component* version, between this panel and `concierge-chat.tsx`).
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
  readonly csrfToken: string | null;
  readonly microphoneConsent: boolean | null;
  readonly onGrantMicrophoneConsent: () => void;
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

export function VoicePanel({
  locale,
  csrfToken,
  microphoneConsent,
  onGrantMicrophoneConsent,
}: VoicePanelProps) {
  const [state, setState] = useState(INITIAL_VOICE_CALL_STATE);
  const [pending, setPending] = useState<PendingConfirmationView | null>(null);
  const [confirmedKind, setConfirmedKind] = useState<'BOOKING' | 'EVENT' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const clientRef = useRef<VoiceCallClient | null>(null);
  const lastHandledTokenRef = useRef<string | null>(null);

  function dispatch(event: VoiceCallEvent) {
    setState((prior) => voiceCallReducer(prior, event));
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
          <button type="button" onClick={onGrantMicrophoneConsent} disabled={!csrfToken}>
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
