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

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}

export function ConciergeChat({ locale }: ConciergeChatProps) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [turns, setTurns] = useState<readonly ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingConfirmationView | null>(null);
  const [confirmedKind, setConfirmedKind] = useState<'BOOKING' | 'EVENT' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session/csrf')
      .then((response) => response.json())
      .then((body: { csrfToken?: string }) => {
        if (!cancelled && body.csrfToken) setCsrfToken(body.csrfToken);
      })
      .catch(() => {
        if (!cancelled) setError('Could not start a session. Please reload the page.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!csrfToken || message.length === 0) return;

    setSubmitting(true);
    setError(null);
    setTurns((prior) => [...prior, { role: 'user', content: message }]);
    setInput('');

    try {
      const response = await fetch('/api/concierge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, locale, csrfToken }),
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
    if (!pending || !csrfToken) return;
    setSubmitting(true);
    setError(null);

    const result = await submitPendingConfirmation(pending, csrfToken, 'TEXT_CONCIERGE');
    if (!result.ok) {
      setError(result.error);
    } else {
      setConfirmedKind(pending.kind);
      setPending(null);
    }
    setSubmitting(false);
  }

  return (
    <div>
      <p>{chromeText('conciergeIntro', locale)}</p>

      <ul aria-live="polite">
        {turns.map((turn, index) => (
          <li key={index}>
            <strong>{turn.role === 'user' ? '>' : ''}</strong> {turn.content}
          </li>
        ))}
        {submitting && !pending ? <li>{chromeText('conciergeThinkingLabel', locale)}</li> : null}
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
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      <form onSubmit={(event) => void handleSend(event)}>
        <label htmlFor="concierge-input">{chromeText('conciergeInputLabel', locale)}</label>
        <input
          id="concierge-input"
          type="text"
          required
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" disabled={submitting || !csrfToken}>
          {chromeText('conciergeSendButtonLabel', locale)}
        </button>
      </form>
    </div>
  );
}
