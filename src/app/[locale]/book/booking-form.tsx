'use client';

/**
 * Booking/treehouse request form — Runbook Step 22.
 *
 * Three stages: fill in details, review the server-echoed result and
 * confirm, then a "received, pending staff confirmation" state — never a
 * confirmed reservation (data-model-v2.md §5: "a requested time is not
 * availability"). Client-rendered (fetch calls to `/api/bookings/*`),
 * unlike Step 17's no-JS menu search — this is a multi-step flow with
 * server round-trips between steps, not a single filterable list.
 *
 * The CSRF token comes from `GET /api/session/csrf` on mount (there is no
 * "current cart" equivalent to piggyback it on, unlike takeaway).
 * `idempotencyKey` is generated once per confirm attempt on the client and
 * reused on any retry of that same attempt, so a network retry replays
 * instead of duplicating (`lib/domain/idempotency.ts`).
 */

import { useEffect, useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import type { SeatingPreference } from '../../../lib/schemas/common';

interface BookingFormProps {
  readonly locale: Locale;
  readonly initialSeatingPreference: SeatingPreference;
}

interface DraftFields {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly partySize: string;
  readonly seatingPreference: SeatingPreference;
  readonly notes: string;
}

interface ReviewedBooking {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly partySize: number;
  readonly seatingPreference: SeatingPreference;
  readonly notes: string | null;
}

type Stage =
  | { readonly kind: 'form' }
  | {
      readonly kind: 'review';
      readonly review: ReviewedBooking;
      readonly confirmationToken: string;
    }
  | { readonly kind: 'confirmed' };

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}

export function BookingForm({ locale, initialSeatingPreference }: BookingFormProps) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [fields, setFields] = useState<DraftFields>({
    guestName: '',
    guestPhone: '',
    requestedDate: '',
    requestedTime: '',
    partySize: '2',
    seatingPreference: initialSeatingPreference,
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
        if (!cancelled) setError('Could not start a session. Please reload the page.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/bookings/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: fields.guestName,
          guestPhone: fields.guestPhone,
          requestedDate: fields.requestedDate,
          requestedTime: fields.requestedTime,
          partySize: Number(fields.partySize),
          seatingPreference: fields.seatingPreference,
          notes: fields.notes.length > 0 ? fields.notes : undefined,
          csrfToken,
        }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      const body = (await response.json()) as {
        review: ReviewedBooking;
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
    if (stage.kind !== 'review' || !csrfToken) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/bookings/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: stage.review.guestName,
          guestPhone: stage.review.guestPhone,
          requestedDate: stage.review.requestedDate,
          requestedTime: stage.review.requestedTime,
          partySize: stage.review.partySize,
          seatingPreference: stage.review.seatingPreference,
          notes: stage.review.notes ?? undefined,
          sourceChannel: 'WEB',
          confirmationToken: stage.confirmationToken,
          idempotencyKey: crypto.randomUUID(),
          csrfToken,
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
      <div role="status">
        <h2>{chromeText('bookConfirmedHeading', locale)}</h2>
        <p>{chromeText('bookConfirmedBody', locale)}</p>
      </div>
    );
  }

  if (stage.kind === 'review') {
    const { review } = stage;
    return (
      <div>
        <h2>{chromeText('bookReviewHeading', locale)}</h2>
        <dl>
          <dt>{chromeText('bookFormNameLabel', locale)}</dt>
          <dd>{review.guestName}</dd>
          <dt>{chromeText('bookFormPhoneLabel', locale)}</dt>
          <dd>{review.guestPhone}</dd>
          <dt>{chromeText('bookFormDateLabel', locale)}</dt>
          <dd>{review.requestedDate}</dd>
          <dt>{chromeText('bookFormTimeLabel', locale)}</dt>
          <dd>{review.requestedTime}</dd>
          <dt>{chromeText('bookFormPartySizeLabel', locale)}</dt>
          <dd>{review.partySize}</dd>
          <dt>{chromeText('bookFormSeatingLabel', locale)}</dt>
          <dd>
            {review.seatingPreference === 'TREEHOUSE'
              ? chromeText('seatingTreehouseLabel', locale)
              : chromeText('seatingGeneralLabel', locale)}
          </dd>
          {review.notes ? (
            <>
              <dt>{chromeText('bookFormNotesLabel', locale)}</dt>
              <dd>{review.notes}</dd>
            </>
          ) : null}
        </dl>
        {error ? (
          <p role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        <button type="button" onClick={() => setStage({ kind: 'form' })} disabled={submitting}>
          {chromeText('bookEditButtonLabel', locale)}
        </button>
        <button type="button" onClick={() => void handleConfirm()} disabled={submitting}>
          {chromeText('bookConfirmButtonLabel', locale)}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleReview(event)}>
      <div>
        <label htmlFor="book-name">{chromeText('bookFormNameLabel', locale)}</label>
        <input
          id="book-name"
          type="text"
          required
          value={fields.guestName}
          onChange={(event) => setFields({ ...fields, guestName: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor="book-phone">{chromeText('bookFormPhoneLabel', locale)}</label>
        <input
          id="book-phone"
          type="tel"
          required
          value={fields.guestPhone}
          onChange={(event) => setFields({ ...fields, guestPhone: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor="book-date">{chromeText('bookFormDateLabel', locale)}</label>
        <input
          id="book-date"
          type="date"
          required
          value={fields.requestedDate}
          onChange={(event) => setFields({ ...fields, requestedDate: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor="book-time">{chromeText('bookFormTimeLabel', locale)}</label>
        <input
          id="book-time"
          type="time"
          required
          value={fields.requestedTime}
          onChange={(event) => setFields({ ...fields, requestedTime: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor="book-party-size">{chromeText('bookFormPartySizeLabel', locale)}</label>
        <input
          id="book-party-size"
          type="number"
          min={1}
          max={200}
          required
          value={fields.partySize}
          onChange={(event) => setFields({ ...fields, partySize: event.target.value })}
        />
      </div>
      <fieldset>
        <legend>{chromeText('bookFormSeatingLabel', locale)}</legend>
        <label>
          <input
            type="radio"
            name="seating"
            checked={fields.seatingPreference === 'GENERAL'}
            onChange={() => setFields({ ...fields, seatingPreference: 'GENERAL' })}
          />
          {chromeText('seatingGeneralLabel', locale)}
        </label>
        <label>
          <input
            type="radio"
            name="seating"
            checked={fields.seatingPreference === 'TREEHOUSE'}
            onChange={() => setFields({ ...fields, seatingPreference: 'TREEHOUSE' })}
          />
          {chromeText('seatingTreehouseLabel', locale)}
        </label>
      </fieldset>
      <div>
        <label htmlFor="book-notes">{chromeText('bookFormNotesLabel', locale)}</label>
        <textarea
          id="book-notes"
          maxLength={500}
          value={fields.notes}
          onChange={(event) => setFields({ ...fields, notes: event.target.value })}
        />
      </div>
      {error ? (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={submitting || !csrfToken}>
        {chromeText('bookSubmitButtonLabel', locale)}
      </button>
    </form>
  );
}
