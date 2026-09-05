'use client';

/**
 * Concierge chat widget — Runbook Step 28.
 *
 * Plain message list + input, posting to `/api/concierge/chat`
 * (Step 27). When a reply carries `pendingConfirmation` (Step 28's
 * `prepareBookingRequest`/`prepareEventRequest` tools), this renders the
 * shared review card (`pending-confirmation.tsx`, extracted in Step 33 so
 * `voice-panel.tsx` renders the identical card) with a tappable Confirm
 * control — the assistant itself never submits anything (`tool-registry.ts`'s
 * doc comment: no submit tool is ever registered). Tapping Confirm calls
 * the exact same `POST /api/bookings/submit` / `POST /api/events/submit`
 * endpoints the manual `/book`/`/event` forms use, with the same
 * confirmation-token/idempotency-key contract — "manual/text workflows
 * produce equivalent records," not a second write path.
 *
 * Step 40: `csrfToken` is now an *optional* prop with two callers.
 * `concierge-mode-toggle.tsx` (voice available) resolves it once itself
 * and passes it down — this component then does no fetching of its own,
 * closing a real, reproduced cross-component session race with the
 * sibling `VoicePanel` (see that file's doc comment). `page.tsx` (voice
 * unavailable — no sibling exists to race with) still renders this
 * component standalone with no `csrfToken` prop at all, in which case it
 * falls back to its original self-managed `GET /api/session/csrf` fetch —
 * `providedCsrfToken === undefined` is exactly how it tells the two
 * callers apart (a parent-controlled `null`, while still loading, is a
 * defined value and does not fall back).
 */

import { useEffect, useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import {
  PendingConfirmationCard,
  submitPendingConfirmation,
  type PendingConfirmationView,
} from './pending-confirmation';

interface ConciergeChatProps {
  readonly locale: Locale;
  readonly csrfToken?: string | null;
}

interface ChatTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

interface ChatResponseBody {
  readonly reply: string;
  readonly escalate: boolean;
  readonly pendingConfirmation?: PendingConfirmationView;
}

/**
 * The starter questions offered on an empty conversation.
 *
 * Each is a question the concierge can genuinely answer from approved
 * knowledge (hours, directions, seating, décor) — deliberately not
 * "what do you recommend?" or anything inviting an answer the assistant
 * would have to invent. The button's own text is what gets sent.
 */
const STARTER_KEYS = [
  'conciergeStarterHours',
  'conciergeStarterDirections',
  'conciergeStarterSeating',
  'conciergeStarterBirthday',
] as const;

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}

export function ConciergeChat({ locale, csrfToken: providedCsrfToken }: ConciergeChatProps) {
  const isControlled = providedCsrfToken !== undefined;
  const [ownCsrfToken, setOwnCsrfToken] = useState<string | null>(null);
  const csrfToken = isControlled ? providedCsrfToken : ownCsrfToken;
  const [turns, setTurns] = useState<readonly ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingConfirmationView | null>(null);
  const [confirmedKind, setConfirmedKind] = useState<'BOOKING' | 'EVENT' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Standalone use only (`page.tsx` when voice is unavailable — no sibling
  // component exists on that page to race a session mint with). Skipped
  // entirely when a parent already resolved `csrfToken` — see the module
  // doc comment.
  useEffect(() => {
    if (isControlled) return;
    let cancelled = false;
    fetch('/api/session/csrf')
      .then((response) => response.json())
      .then((body: { csrfToken?: string }) => {
        if (!cancelled && body.csrfToken) setOwnCsrfToken(body.csrfToken);
      })
      .catch(() => {
        // Fetched again on demand when the guest sends; see ensureCsrfToken.
      });
    return () => {
      cancelled = true;
    };
  }, [isControlled]);

  /**
   * Resolves a usable CSRF token, fetching one if the request on mount did
   * not produce it. A controlled token comes from the parent and is used as
   * given. Recovering here rather than disabling the send button means one
   * failed background fetch cannot leave the composer permanently dead.
   */
  async function ensureCsrfToken(): Promise<string | null> {
    if (csrfToken) return csrfToken;
    if (isControlled) return null;
    try {
      const response = await fetch('/api/session/csrf');
      if (!response.ok) return null;
      const body = (await response.json()) as { csrfToken?: string };
      if (!body.csrfToken) return null;
      setOwnCsrfToken(body.csrfToken);
      return body.csrfToken;
    } catch {
      return null;
    }
  }

  function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return handleSendText(input);
  }

  /**
   * Sends one guest message. Shared by the composer and the starter
   * questions, so a starter follows exactly the same path — and sends
   * exactly the text the guest saw on the button.
   */
  async function handleSendText(rawMessage: string) {
    const message = rawMessage.trim();
    if (message.length === 0) return;

    setSubmitting(true);
    setError(null);

    const token = await ensureCsrfToken();
    if (!token) {
      setError(chromeText('sessionUnavailableError', locale));
      setSubmitting(false);
      return;
    }

    setTurns((prior) => [...prior, { role: 'user', content: message }]);
    setInput('');

    try {
      const response = await fetch('/api/concierge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, locale, csrfToken: token }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      const body = (await response.json()) as ChatResponseBody;
      setTurns((prior) => [...prior, { role: 'assistant', content: body.reply }]);
      setPending(body.pendingConfirmation ?? null);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!pending) return;
    setSubmitting(true);
    setError(null);

    const token = await ensureCsrfToken();
    if (!token) {
      setError(chromeText('sessionUnavailableError', locale));
      setSubmitting(false);
      return;
    }

    const result = await submitPendingConfirmation(pending, token, 'TEXT_CONCIERGE');
    if (!result.ok) {
      setError(result.error);
    } else {
      setConfirmedKind(pending.kind);
      setPending(null);
    }
    setSubmitting(false);
  }

  return (
    <div className="chat">
      {/*
       * The welcome stays visible above the transcript rather than being
       * injected as a fake first message from the concierge — it is
       * interface copy, not something the assistant said.
       */}
      <p className="u-lede">{chromeText('conciergeIntro', locale)}</p>

      {/*
       * Starter questions are real, pre-filled guest messages: choosing one
       * sends exactly the text shown, so nothing is put in the guest's mouth
       * that they did not see. They disappear once a conversation is under
       * way rather than crowding the transcript.
       */}
      {turns.length === 0 ? (
        <ul className="chat-starters">
          {STARTER_KEYS.map((key) => (
            <li key={key}>
              <button
                type="button"
                className="u-button u-button--secondary"
                disabled={submitting}
                onClick={() => void handleSendText(chromeText(key, locale))}
              >
                {chromeText(key, locale)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="chat-log" aria-live="polite">
        {turns.map((turn, index) => (
          <li key={index} className={turn.role === 'user' ? 'chat-turn-user' : 'chat-turn-agent'}>
            {/* The speaker is named in text, not conveyed by alignment or
                colour alone (WCAG 1.4.1). */}
            <span className="chat-speaker">
              {turn.role === 'user'
                ? chromeText('chatSpeakerYou', locale)
                : chromeText('chatSpeakerConcierge', locale)}
            </span>
            <span className="chat-bubble">{turn.content}</span>
          </li>
        ))}
        {submitting && !pending ? (
          <li className="chat-turn-agent">
            <span className="chat-speaker">{chromeText('chatSpeakerConcierge', locale)}</span>
            <span className="chat-bubble u-muted">
              {chromeText('conciergeThinkingLabel', locale)}
            </span>
          </li>
        ) : null}
      </ul>

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
          onDismiss={() => setPending(null)}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}

      {error ? (
        <p className="alert" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      <form className="chat-composer" onSubmit={(event) => void handleSend(event)}>
        <div className="field">
          <label htmlFor="concierge-input">{chromeText('conciergeInputLabel', locale)}</label>
          <input
            id="concierge-input"
            type="text"
            required
            autoComplete="off"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        {/* Disabled only while a send is in flight — see booking-form.tsx on
            why the CSRF token is not part of this condition. */}
        <button type="submit" className="u-button u-button--primary" disabled={submitting}>
          {chromeText('conciergeSendButtonLabel', locale)}
        </button>
      </form>
    </div>
  );
}
