/**
 * Booking request preparation and submission — Runbook Step 19.
 *
 * Same shape as `modules/takeaway/submission-service.ts` (see that file's
 * doc comment for the full data-model-v2.md §7 step list), minus the
 * cart/menu/totals steps a booking has no equivalent of. "A requested time
 * is not availability" (data-model-v2.md §5) — nothing here invents or
 * checks availability; that is exclusively a later staff `CONFIRMED`
 * transition (`state-machine.ts`).
 */

import { ok, type Result } from '../../lib/result';
import { type AppError } from '../../lib/errors';
import { assertServerOnly } from '../../lib/server-only';
import type { SeatingPreference, SourceChannel } from '../../lib/schemas/common';
import type { Actor } from '../../lib/domain/actor';
import type { AppendOnlySink } from '../../lib/domain/sink';
import { buildAuditEvent, type AuditEvent } from '../../lib/domain/audit-event';
import { buildStatusEvent, type StatusEvent } from '../../lib/domain/status-event';
import { buildOutboxEvent, type OutboxEvent } from '../../lib/domain/outbox';
import {
  consumeConfirmationToken,
  issueConfirmationToken,
  type ConfirmationTokenStore,
} from '../../lib/domain/confirmation-token';
import { runIdempotent, type IdempotencyStore } from '../../lib/domain/idempotency';
import { hashReview } from '../../lib/domain/review-hash';
import type { VersionedStore } from '../../lib/domain/versioned-store';
import type { BookingRequestRecord } from './request';

assertServerOnly('src/modules/bookings/submission-service.ts');

export interface BookingReview {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly partySize: number;
  readonly seatingPreference: SeatingPreference;
  readonly notes: string | null;
}

interface BookingDraftFields {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly partySize: number;
  readonly seatingPreference: SeatingPreference;
  readonly notes?: string | null;
}

function buildReview(fields: BookingDraftFields): BookingReview {
  return {
    guestName: fields.guestName,
    guestPhone: fields.guestPhone,
    requestedDate: fields.requestedDate,
    requestedTime: fields.requestedTime,
    partySize: fields.partySize,
    seatingPreference: fields.seatingPreference,
    notes: fields.notes ?? null,
  };
}

export interface BookingServiceDeps {
  readonly confirmationTokens: ConfirmationTokenStore;
  readonly idempotency: IdempotencyStore<SubmitBookingRequestResult>;
  readonly requestStore: VersionedStore<BookingRequestRecord>;
  readonly statusEvents: AppendOnlySink<StatusEvent>;
  readonly auditEvents: AppendOnlySink<AuditEvent>;
  readonly outbox: AppendOnlySink<OutboxEvent>;
  readonly generateId: () => string;
  readonly now?: () => Date;
}

export interface PrepareBookingRequestInput extends BookingDraftFields {
  readonly sessionId: string;
  readonly tokenTtlSeconds?: number;
}

export interface PrepareBookingRequestResult {
  readonly review: BookingReview;
  readonly confirmationToken: string;
}

export async function prepareBookingRequest(
  deps: Pick<BookingServiceDeps, 'confirmationTokens' | 'now'>,
  input: PrepareBookingRequestInput,
): Promise<Result<PrepareBookingRequestResult, AppError>> {
  const review = buildReview(input);
  const { rawToken } = await issueConfirmationToken(deps.confirmationTokens, {
    sessionId: input.sessionId,
    action: 'BOOKING_REQUEST',
    reviewHash: hashReview(review),
    ttlSeconds: input.tokenTtlSeconds ?? 900,
    now: deps.now,
  });
  return ok({ review, confirmationToken: rawToken });
}

export interface SubmitBookingRequestInput extends BookingDraftFields {
  readonly sessionId: string;
  readonly sourceChannel: SourceChannel;
  readonly confirmationToken: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface SubmitBookingRequestResult {
  readonly requestId: string;
  readonly state: 'REQUESTED';
}

export async function submitBookingRequest(
  deps: BookingServiceDeps,
  input: SubmitBookingRequestInput,
): Promise<Result<SubmitBookingRequestResult, AppError>> {
  const now = deps.now ?? (() => new Date());
  const actor: Actor = { type: 'GUEST', id: input.sessionId };

  return runIdempotent(
    deps.idempotency,
    {
      scope: `${input.sessionId}:submitBookingRequest`,
      key: input.idempotencyKey,
      fingerprint: input.confirmationToken,
      correlationId: input.correlationId,
      now,
    },
    async (): Promise<Result<SubmitBookingRequestResult, AppError>> => {
      const review = buildReview(input);
      const tokenResult = await consumeConfirmationToken(deps.confirmationTokens, {
        rawToken: input.confirmationToken,
        sessionId: input.sessionId,
        action: 'BOOKING_REQUEST',
        reviewHash: hashReview(review),
        now,
        correlationId: input.correlationId,
      });
      if (!tokenResult.ok) return tokenResult;

      const requestId = deps.generateId();
      const record: BookingRequestRecord = {
        id: requestId,
        version: 1,
        state: 'REQUESTED',
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        requestedDate: input.requestedDate,
        requestedTime: input.requestedTime,
        partySize: input.partySize,
        seatingPreference: input.seatingPreference,
        notes: input.notes ?? null,
        sessionId: input.sessionId,
        sourceChannel: input.sourceChannel,
        assignedStaffId: null,
        createdAt: now().toISOString(),
      };
      await deps.requestStore.create(record);

      await deps.statusEvents.append(
        buildStatusEvent({
          entityType: 'BOOKING_REQUEST',
          entityId: requestId,
          previousState: null,
          newState: record.state,
          actor,
          requestVersion: record.version,
          correlationId: input.correlationId,
          now,
        }),
      );
      await deps.auditEvents.append(
        buildAuditEvent({
          category: 'ADMIN',
          action: 'booking_request.submitted',
          actor,
          targetType: 'BOOKING_REQUEST',
          targetId: requestId,
          correlationId: input.correlationId,
          now,
        }),
      );
      await deps.outbox.append(
        buildOutboxEvent({
          eventType: 'booking_request.requested',
          entityType: 'BOOKING_REQUEST',
          entityId: requestId,
          payload: { partySize: record.partySize, seatingPreference: record.seatingPreference },
          destination: 'staff_notification',
          generateId: deps.generateId,
          now,
        }),
      );

      return ok({ requestId, state: 'REQUESTED' });
    },
  );
}
