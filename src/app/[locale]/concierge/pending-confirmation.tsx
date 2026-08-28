'use client';

/**
 * Shared pending-confirmation review card — extracted from
 * `concierge-chat.tsx` (Step 28) in Step 33 so `voice-panel.tsx` renders
 * the *identical* review card and hits the *identical* submit endpoints a
 * text-chat guest would, rather than a second, possibly-drifting copy.
 * Both callers own their own polling/turn logic; this owns only the
 * rendering and the submit call.
 *
 * The assistant (text or voice) never submits anything itself — tapping
 * Confirm here calls the exact same `POST /api/bookings/submit` /
 * `POST /api/events/submit` endpoints the manual `/book`/`/event` forms
 * use, with the same confirmation-token/idempotency-key contract.
 */

import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import type { SeatingPreference } from '../../../lib/schemas/common';

export interface BookingReviewView {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly partySize: number;
  readonly seatingPreference: SeatingPreference;
  readonly notes: string | null;
}

export interface EventReviewView {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly occasion: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly guestCount: number;
  readonly decorInterest: boolean;
  readonly notes: string | null;
}

export type PendingConfirmationView =
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

/** Matches `lib/schemas/common.ts#sourceChannelSchema` exactly — voice is per-locale (`VOICE_EN`/`VOICE_UR`), not one combined value. */
export type SourceChannel = 'TEXT_CONCIERGE' | 'VOICE_EN' | 'VOICE_UR';

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong. Please try again.';
  } catch {
    return 'Something went wrong. Please try again.';
  }
}

export type SubmitPendingConfirmationResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Calls the real manual-flow submit endpoint directly — never a second write path. */
export async function submitPendingConfirmation(
  pending: PendingConfirmationView,
  csrfToken: string,
  sourceChannel: SourceChannel,
): Promise<SubmitPendingConfirmationResult> {
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
          sourceChannel,
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
          sourceChannel,
          confirmationToken: pending.confirmationToken,
          idempotencyKey: crypto.randomUUID(),
          csrfToken,
        };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, error: await parseApiError(response) };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

interface PendingConfirmationCardProps {
  readonly pending: PendingConfirmationView;
  readonly locale: Locale;
  readonly submitting: boolean;
  readonly onDismiss: () => void;
  readonly onConfirm: () => void;
}

export function PendingConfirmationCard({
  pending,
  locale,
  submitting,
  onDismiss,
  onConfirm,
}: PendingConfirmationCardProps) {
  return (
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
      <button type="button" onClick={onDismiss} disabled={submitting}>
        {chromeText('conciergeDismissButtonLabel', locale)}
      </button>
      <button type="button" onClick={onConfirm} disabled={submitting}>
        {pending.kind === 'BOOKING'
          ? chromeText('bookConfirmButtonLabel', locale)
          : chromeText('eventConfirmButtonLabel', locale)}
      </button>
    </div>
  );
}
