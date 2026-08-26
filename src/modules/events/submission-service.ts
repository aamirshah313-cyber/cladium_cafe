/**
 * Event request preparation and submission — Runbook Step 19.
 *
 * Same shape as `modules/bookings/submission-service.ts`. "No cake/outside-
 * food exception may be promised" and "decor starts from PKR 8,000; do not
 * calculate final price" (`agent/tool-contracts.md`) are guardrails for
 * whatever calls this service (the concierge tool layer, a later step) —
 * this service itself never computes or invents a price; `quotedAmountPkr`
 * is always `null` at creation, exactly like `event_requests`' own schema.
 */

import { ok, type Result } from '../../lib/result';
import { type AppError } from '../../lib/errors';
import { assertServerOnly } from '../../lib/server-only';
import type { SourceChannel } from '../../lib/schemas/common';
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
import type { EventRequestRecord } from './request';

assertServerOnly('src/modules/events/submission-service.ts');

export interface EventReview {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly occasion: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly guestCount: number;
  readonly decorInterest: boolean;
  readonly notes: string | null;
}

interface EventDraftFields {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly occasion: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly guestCount: number;
  readonly decorInterest: boolean;
  readonly notes?: string | null;
}

function buildReview(fields: EventDraftFields): EventReview {
  return {
    guestName: fields.guestName,
    guestPhone: fields.guestPhone,
    occasion: fields.occasion,
    requestedDate: fields.requestedDate,
    requestedTime: fields.requestedTime,
    guestCount: fields.guestCount,
    decorInterest: fields.decorInterest,
    notes: fields.notes ?? null,
  };
}

export interface EventServiceDeps {
  readonly confirmationTokens: ConfirmationTokenStore;
  readonly idempotency: IdempotencyStore<SubmitEventRequestResult>;
  readonly requestStore: VersionedStore<EventRequestRecord>;
  readonly statusEvents: AppendOnlySink<StatusEvent>;
  readonly auditEvents: AppendOnlySink<AuditEvent>;
  readonly outbox: AppendOnlySink<OutboxEvent>;
  readonly generateId: () => string;
  readonly now?: () => Date;
}

export interface PrepareEventRequestInput extends EventDraftFields {
  readonly sessionId: string;
  readonly tokenTtlSeconds?: number;
}

export interface PrepareEventRequestResult {
  readonly review: EventReview;
  readonly confirmationToken: string;
}

export async function prepareEventRequest(
  deps: Pick<EventServiceDeps, 'confirmationTokens' | 'now'>,
  input: PrepareEventRequestInput,
): Promise<Result<PrepareEventRequestResult, AppError>> {
  const review = buildReview(input);
  const { rawToken } = await issueConfirmationToken(deps.confirmationTokens, {
    sessionId: input.sessionId,
    action: 'EVENT_REQUEST',
    reviewHash: hashReview(review),
    ttlSeconds: input.tokenTtlSeconds ?? 900,
    now: deps.now,
  });
  return ok({ review, confirmationToken: rawToken });
}

export interface SubmitEventRequestInput extends EventDraftFields {
  readonly sessionId: string;
  readonly sourceChannel: SourceChannel;
  readonly confirmationToken: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface SubmitEventRequestResult {
  readonly requestId: string;
  readonly state: 'REQUESTED';
}

export async function submitEventRequest(
  deps: EventServiceDeps,
  input: SubmitEventRequestInput,
): Promise<Result<SubmitEventRequestResult, AppError>> {
  const now = deps.now ?? (() => new Date());
  const actor: Actor = { type: 'GUEST', id: input.sessionId };

  return runIdempotent(
    deps.idempotency,
    {
      scope: `${input.sessionId}:submitEventRequest`,
      key: input.idempotencyKey,
      fingerprint: input.confirmationToken,
      correlationId: input.correlationId,
      now,
    },
    async (): Promise<Result<SubmitEventRequestResult, AppError>> => {
      const review = buildReview(input);
      const tokenResult = await consumeConfirmationToken(deps.confirmationTokens, {
        rawToken: input.confirmationToken,
        sessionId: input.sessionId,
        action: 'EVENT_REQUEST',
        reviewHash: hashReview(review),
        now,
        correlationId: input.correlationId,
      });
      if (!tokenResult.ok) return tokenResult;

      const requestId = deps.generateId();
      const record: EventRequestRecord = {
        id: requestId,
        version: 1,
        state: 'REQUESTED',
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        occasion: input.occasion,
        requestedDate: input.requestedDate,
        requestedTime: input.requestedTime,
        guestCount: input.guestCount,
        decorInterest: input.decorInterest,
        notes: input.notes ?? null,
        quotedAmountPkr: null,
        sessionId: input.sessionId,
        sourceChannel: input.sourceChannel,
        assignedStaffId: null,
        createdAt: now().toISOString(),
      };
      await deps.requestStore.create(record);

      await deps.statusEvents.append(
        buildStatusEvent({
          entityType: 'EVENT_REQUEST',
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
          action: 'event_request.submitted',
          actor,
          targetType: 'EVENT_REQUEST',
          targetId: requestId,
          correlationId: input.correlationId,
          now,
        }),
      );
      await deps.outbox.append(
        buildOutboxEvent({
          eventType: 'event_request.requested',
          entityType: 'EVENT_REQUEST',
          entityId: requestId,
          payload: { guestCount: record.guestCount, decorInterest: record.decorInterest },
          destination: 'staff_notification',
          generateId: deps.generateId,
          now,
        }),
      );

      return ok({ requestId, state: 'REQUESTED' });
    },
  );
}
