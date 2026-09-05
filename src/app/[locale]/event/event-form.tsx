'use client';

/**
 * Birthday/event enquiry form — Runbook Step 23.
 *
 * Same three-stage shape as `book/booking-form.tsx` (form → server-echoed
 * review → confirmed, CSRF token from `GET /api/session/csrf`, an
 * idempotency key generated once per confirm attempt). `decorInterest` is
 * only a flag the guest ticks — it never computes or promises a price;
 * the approved starting figure lives as display copy on `event/page.tsx`,
 * not in this component, and the confirmed-stage text is explicit that no
 * quote or confirmation has happened yet (only a staff `QUOTED`/`CONFIRMED`
 * transition can do that — `modules/events/state-machine.ts`).
 */

import { useEffect, useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';

interface EventFormProps {
  readonly locale: Locale;
}

interface DraftFields {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly occasion: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly guestCount: string;
  readonly decorInterest: boolean;
  readonly notes: string;
}

interface ReviewedEvent {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly occasion: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly guestCount: number;
  readonly decorInterest: boolean;
  readonly notes: string | null;
}

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'review'; readonly review: ReviewedEvent; readonly confirmationToken: string }
  | { readonly kind: 'confirmed' };

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}

export function EventForm({ locale }: EventFormProps) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [fields, setFields] = useState<DraftFields>({
    guestName: '',
    guestPhone: '',
    occasion: '',
    requestedDate: '',
    requestedTime: '',
    guestCount: '10',
    decorInterest: false,
    notes: '',
  });
  const [stage, setStage] = useState<Stage>({ kind: 'form' });
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
        // Fetched again on demand at submit time; see ensureCsrfToken.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Returns a usable CSRF token, fetching one if the request on mount did
   * not produce it. Recovering here rather than disabling the submit button
   * means one failed background fetch cannot leave the form permanently
   * unusable with no way to retry.
   */
  async function ensureCsrfToken(): Promise<string | null> {
    if (csrfToken) return csrfToken;
    try {
      const response = await fetch('/api/session/csrf');
      if (!response.ok) return null;
      const body = (await response.json()) as { csrfToken?: string };
      if (!body.csrfToken) return null;
      setCsrfToken(body.csrfToken);
      return body.csrfToken;
    } catch {
      return null;
    }
  }

  async function handleReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const token = await ensureCsrfToken();
    if (!token) {
      setError(chromeText('sessionUnavailableError', locale));
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/events/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: fields.guestName,
          guestPhone: fields.guestPhone,
          occasion: fields.occasion,
          requestedDate: fields.requestedDate,
          requestedTime: fields.requestedTime,
          guestCount: Number(fields.guestCount),
          decorInterest: fields.decorInterest,
          notes: fields.notes.length > 0 ? fields.notes : undefined,
          csrfToken: token,
        }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      const body = (await response.json()) as {
        review: ReviewedEvent;
        confirmationToken: string;
      };
      setStage({ kind: 'review', review: body.review, confirmationToken: body.confirmationToken });
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (stage.kind !== 'review') return;
    setSubmitting(true);
    setError(null);

    const token = await ensureCsrfToken();
    if (!token) {
      setError(chromeText('sessionUnavailableError', locale));
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/events/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: stage.review.guestName,
          guestPhone: stage.review.guestPhone,
          occasion: stage.review.occasion,
          requestedDate: stage.review.requestedDate,
          requestedTime: stage.review.requestedTime,
          guestCount: stage.review.guestCount,
          decorInterest: stage.review.decorInterest,
          notes: stage.review.notes ?? undefined,
          sourceChannel: 'WEB',
          confirmationToken: stage.confirmationToken,
          idempotencyKey: crypto.randomUUID(),
          csrfToken: token,
        }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      setStage({ kind: 'confirmed' });
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (stage.kind === 'confirmed') {
    return (
      <div className="receipt" role="status">
        <h2>{chromeText('eventConfirmedHeading', locale)}</h2>
        <p>{chromeText('eventConfirmedBody', locale)}</p>
      </div>
    );
  }

  if (stage.kind === 'review') {
    const { review } = stage;
    return (
      <div>
        <h2>{chromeText('eventReviewHeading', locale)}</h2>
        <dl className="summary-list">
          <dt>{chromeText('bookFormNameLabel', locale)}</dt>
          <dd>{review.guestName}</dd>
          <dt>{chromeText('bookFormPhoneLabel', locale)}</dt>
          <dd>{review.guestPhone}</dd>
          <dt>{chromeText('eventFormOccasionLabel', locale)}</dt>
          <dd>{review.occasion}</dd>
          <dt>{chromeText('bookFormDateLabel', locale)}</dt>
          <dd>{review.requestedDate}</dd>
          <dt>{chromeText('bookFormTimeLabel', locale)}</dt>
          <dd>{review.requestedTime}</dd>
          <dt>{chromeText('eventFormGuestCountLabel', locale)}</dt>
          <dd>{review.guestCount}</dd>
          <dt>{chromeText('eventFormDecorInterestLabel', locale)}</dt>
          <dd>
            {review.decorInterest ? chromeText('yesLabel', locale) : chromeText('noLabel', locale)}
          </dd>
          {review.notes ? (
            <>
              <dt>{chromeText('bookFormNotesLabel', locale)}</dt>
              <dd>{review.notes}</dd>
            </>
          ) : null}
        </dl>
        {error ? (
          <p className="alert" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            className="u-button u-button--primary"
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            {chromeText('eventConfirmButtonLabel', locale)}
          </button>
          <button
            type="button"
            className="u-button u-button--secondary"
            onClick={() => setStage({ kind: 'form' })}
            disabled={submitting}
          >
            {chromeText('bookEditButtonLabel', locale)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleReview(event)}>
      <div className="field">
        <label htmlFor="event-name">{chromeText('bookFormNameLabel', locale)}</label>
        <input
          id="event-name"
          type="text"
          required
          value={fields.guestName}
          onChange={(event) => setFields({ ...fields, guestName: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="event-phone">{chromeText('bookFormPhoneLabel', locale)}</label>
        <input
          id="event-phone"
          type="tel"
          required
          value={fields.guestPhone}
          onChange={(event) => setFields({ ...fields, guestPhone: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="event-occasion">{chromeText('eventFormOccasionLabel', locale)}</label>
        <input
          id="event-occasion"
          type="text"
          required
          value={fields.occasion}
          onChange={(event) => setFields({ ...fields, occasion: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="event-date">{chromeText('bookFormDateLabel', locale)}</label>
        <input
          id="event-date"
          type="date"
          required
          value={fields.requestedDate}
          onChange={(event) => setFields({ ...fields, requestedDate: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="event-time">{chromeText('bookFormTimeLabel', locale)}</label>
        <input
          id="event-time"
          type="time"
          required
          value={fields.requestedTime}
          onChange={(event) => setFields({ ...fields, requestedTime: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="event-guest-count">{chromeText('eventFormGuestCountLabel', locale)}</label>
        <input
          id="event-guest-count"
          type="number"
          min={1}
          max={200}
          required
          value={fields.guestCount}
          onChange={(event) => setFields({ ...fields, guestCount: event.target.value })}
        />
      </div>
      <div className="field">
        {/*
         * Reuses the seating cards' selectable-row treatment so the décor
         * question reads as a real choice. The note restates the approved
         * position — from PKR 8,000, staff-confirmed — so ticking this box
         * can never look like accepting a quoted price.
         */}
        <label className="choice" htmlFor="event-decor-interest">
          <input
            id="event-decor-interest"
            type="checkbox"
            checked={fields.decorInterest}
            onChange={(event) => setFields({ ...fields, decorInterest: event.target.checked })}
          />
          <span>
            <span className="choice-text">{chromeText('eventFormDecorInterestLabel', locale)}</span>
            <span className="choice-note">{chromeText('eventDecorPricingNote', locale)}</span>
          </span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="event-notes">{chromeText('bookFormNotesLabel', locale)}</label>
        <textarea
          id="event-notes"
          maxLength={500}
          value={fields.notes}
          onChange={(event) => setFields({ ...fields, notes: event.target.value })}
        />
      </div>
      {error ? (
        <p className="alert" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        {/* Disabled only while a request is genuinely in flight — see the
            booking form's note on why the token is not part of this. */}
        <button type="submit" className="u-button u-button--primary" disabled={submitting}>
          {submitting
            ? chromeText('loadingLabel', locale)
            : chromeText('eventSubmitButtonLabel', locale)}
        </button>
      </div>
    </form>
  );
}
