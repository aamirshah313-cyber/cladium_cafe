'use client';

/**
 * Concierge chat widget — Runbook Step 28.
 *
 * Plain message list + input, posting to `/api/concierge/chat`
 * (Step 27). When a reply carries `pendingConfirmation` (Step 28's
 * `prepareBookingRequest`/`prepareEventRequest` tools), this renders a
 * real review card with a tappable Confirm control — the assistant
 * itself never submits anything (`tool-registry.ts`'s doc comment: no
 * submit tool is ever registered). Tapping Confirm calls the exact same
 * `POST /api/bookings/submit` / `POST /api/events/submit` endpoints the
 * manual `/book`/`/event` forms use, with the same confirmation-token/
 * idempotency-key contract — "manual/text workflows produce equivalent
 * records," not a second write path.
 */

import { useEffect, useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import type { SeatingPreference } from '../../../lib/schemas/common';

interface ConciergeChatProps {
  readonly locale: Locale;
}

interface ChatTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

interface BookingReviewView {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly partySize: number;
  readonly seatingPreference: SeatingPreference;
  readonly notes: string | null;
}

interface EventReviewView {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly occasion: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly guestCount: number;
  readonly decorInterest: boolean;
  readonly notes: string | null;
}

type PendingConfirmation =
  | {
      readonly kind: 'BOOKING';
      readonly review: BookingReviewView;
      readonly confirmationToken: string;
    }
  | {
      readonly kind: 'EVENT';
      readonly review: EventReviewView;
      readonly confirmationToken: string;
    };

interface ChatResponseBody {
  readonly reply: string;
  readonly escalate: boolean;
  readonly pendingConfirmation?: PendingConfirmation;
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
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
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

    try {
      const endpoint = pending.kind === 'BOOKING' ? '/api/bookings/submit' : '/api/events/submit';
      const review = pending.review;
      const body =
        pending.kind === 'BOOKING'
          ? {
              guestName: review.guestName,
              guestPhone: review.guestPhone,
              requestedDate: review.requestedDate,
              requestedTime: review.requestedTime,
              partySize: (review as BookingReviewView).partySize,
              seatingPreference: (review as BookingReviewView).seatingPreference,
              notes: review.notes ?? undefined,
              sourceChannel: 'TEXT_CONCIERGE',
              confirmationToken: pending.confirmationToken,
              idempotencyKey: crypto.randomUUID(),
              csrfToken,
            }
          : {
              guestName: review.guestName,
              guestPhone: review.guestPhone,
              occasion: (review as EventReviewView).occasion,
              requestedDate: review.requestedDate,
              requestedTime: review.requestedTime,
              guestCount: (review as EventReviewView).guestCount,
              decorInterest: (review as EventReviewView).decorInterest,
              notes: review.notes ?? undefined,
              sourceChannel: 'TEXT_CONCIERGE',
              confirmationToken: pending.confirmationToken,
              idempotencyKey: crypto.randomUUID(),
              csrfToken,
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      setConfirmedKind(pending.kind);
      setPending(null);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
        <div>
          <h2>{chromeText('conciergeConfirmDraftHeading', locale)}</h2>
          <dl>
            <dt>{chromeText('bookFormNameLabel', locale)}</dt>
            <dd>{pending.review.guestName}</dd>
            <dt>{chromeText('bookFormPhoneLabel', locale)}</dt>
            <dd>{pending.review.guestPhone}</dd>
            {pending.kind === 'EVENT' ? (
              <>
                <dt>{chromeText('eventFormOccasionLabel', locale)}</dt>
                <dd>{pending.review.occasion}</dd>
              </>
            ) : null}
            <dt>{chromeText('bookFormDateLabel', locale)}</dt>
            <dd>{pending.review.requestedDate}</dd>
            <dt>{chromeText('bookFormTimeLabel', locale)}</dt>
            <dd>{pending.review.requestedTime}</dd>
            {pending.kind === 'BOOKING' ? (
              <>
                <dt>{chromeText('bookFormPartySizeLabel', locale)}</dt>
                <dd>{pending.review.partySize}</dd>
                <dt>{chromeText('bookFormSeatingLabel', locale)}</dt>
                <dd>
                  {pending.review.seatingPreference === 'TREEHOUSE'
                    ? chromeText('seatingTreehouseLabel', locale)
                    : chromeText('seatingGeneralLabel', locale)}
                </dd>
              </>
            ) : (
              <>
                <dt>{chromeText('eventFormGuestCountLabel', locale)}</dt>
                <dd>{pending.review.guestCount}</dd>
                <dt>{chromeText('eventFormDecorInterestLabel', locale)}</dt>
                <dd>
                  {pending.review.decorInterest
                    ? chromeText('yesLabel', locale)
                    : chromeText('noLabel', locale)}
                </dd>
              </>
            )}
            {pending.review.notes ? (
              <>
                <dt>{chromeText('bookFormNotesLabel', locale)}</dt>
                <dd>{pending.review.notes}</dd>
              </>
            ) : null}
          </dl>
          <button type="button" onClick={() => setPending(null)} disabled={submitting}>
            {chromeText('conciergeDismissButtonLabel', locale)}
          </button>
          <button type="button" onClick={() => void handleConfirm()} disabled={submitting}>
            {pending.kind === 'BOOKING'
              ? chromeText('bookConfirmButtonLabel', locale)
              : chromeText('eventConfirmButtonLabel', locale)}
          </button>
        </div>
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
