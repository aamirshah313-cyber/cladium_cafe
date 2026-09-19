/**
 * Takeaway request preparation and submission — Runbook Step 19.
 *
 * Implements data-model-v2.md §7 "Submit takeaway request" exactly, in
 * order: lock/validate the session and confirmation token; verify review
 * hash and idempotency key; reload the published menu and recompute
 * integer totals; create the request in `REQUESTED` plus immutable
 * snapshot lines; append status/audit events; mark the confirmation token
 * used and persist the idempotent result; enqueue a staff notification.
 * `agent/tool-contracts.md`'s `prepareTakeawayRequest` (draft review) and
 * `submitTakeawayRequest` (REQUESTED order ID) are the two functions here.
 */

import { err, ok, type Result } from '../../lib/result';
import { featureDisabled, validationFailed, type AppError } from '../../lib/errors';
import { assertServerOnly } from '../../lib/server-only';
import type { SourceChannel } from '../../lib/schemas/common';
import type { Actor } from '../../lib/domain/actor';
import type { AppendOnlySink } from '../../lib/domain/sink';
import type { AuditEvent } from '../../lib/domain/audit-event';
import { buildAuditEvent } from '../../lib/domain/audit-event';
import type { StatusEvent } from '../../lib/domain/status-event';
import { buildStatusEvent } from '../../lib/domain/status-event';
import type { OutboxEvent } from '../../lib/domain/outbox';
import { buildOutboxEvent } from '../../lib/domain/outbox';
import type { ConfirmationTokenStore } from '../../lib/domain/confirmation-token';
import {
  consumeConfirmationToken,
  issueConfirmationToken,
} from '../../lib/domain/confirmation-token';
import type { IdempotencyStore } from '../../lib/domain/idempotency';
import { runIdempotent } from '../../lib/domain/idempotency';
import { hashReview } from '../../lib/domain/review-hash';
import type { VersionedStore } from '../../lib/domain/versioned-store';
import type { PublishedMenuView } from '../menu/menu-view';
import { recomputeCartTotals, type Cart, type CartTotals } from './cart';
import type { TakeawayItemSnapshot, TakeawayRequestRecord } from './request';
// TAKEAWAY_CUSTOMER_CREATABLE_STATE (state-machine.ts) documents this same
// value as `TakeawayState`, a wider union; the literal is used directly
// here so `SubmitTakeawayRequestResult['state']` can stay the narrow
// `'REQUESTED'` literal type instead of widening to the full state union.

assertServerOnly('src/modules/takeaway/submission-service.ts');

export interface TakeawayReview {
  readonly totals: CartTotals;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedCollectionNote: string | null;
  readonly notes: string | null;
}

function buildReview(
  cart: Cart,
  menuView: PublishedMenuView,
  guestDetails: {
    guestName: string;
    guestPhone: string;
    requestedCollectionNote?: string | null;
    notes?: string | null;
  },
): Result<TakeawayReview, AppError> {
  const totalsResult = recomputeCartTotals(cart, menuView);
  if (!totalsResult.ok) return totalsResult;
  return ok({
    totals: totalsResult.value,
    guestName: guestDetails.guestName,
    guestPhone: guestDetails.guestPhone,
    requestedCollectionNote: guestDetails.requestedCollectionNote ?? null,
    notes: guestDetails.notes ?? null,
  });
}

export interface PrepareTakeawayRequestInput {
  readonly sessionId: string;
  readonly cart: Cart;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedCollectionNote?: string | null;
  readonly notes?: string | null;
  readonly tokenTtlSeconds?: number;
}

export interface PrepareTakeawayRequestResult {
  readonly review: TakeawayReview;
  readonly confirmationToken: string;
}

/**
 * Everything one submission writes, as a single unit.
 *
 * The five rows below are not independently useful. A request without its
 * outbox event is an order nobody is told about; a request without its
 * snapshots has no lines; a request without its status event is invisible to
 * the history the staff view reads. They are one fact about the world, so
 * they need one commit.
 */
export interface TakeawaySubmissionWrite {
  readonly request: TakeawayRequestRecord;
  readonly items: readonly TakeawayItemSnapshot[];
  readonly statusEvent: StatusEvent;
  readonly auditEvent: AuditEvent;
  readonly outboxEvent: OutboxEvent;
}

/**
 * Persists a whole submission atomically.
 *
 * Supplied by the Postgres deps as a single transactional call; when it is
 * absent the service falls back to writing through the individual stores in
 * sequence, which is correct for the in-memory implementations used by tests
 * and local development, where a partial write is not a reachable state.
 */
export interface TakeawaySubmissionPersistence {
  persist(write: TakeawaySubmissionWrite): Promise<void>;
}

export interface TakeawayServiceDeps {
  readonly getMenuView: () => Promise<PublishedMenuView>;
  readonly confirmationTokens: ConfirmationTokenStore;
  readonly idempotency: IdempotencyStore<SubmitTakeawayRequestResult>;
  readonly requestStore: VersionedStore<TakeawayRequestRecord>;
  readonly itemSnapshots: AppendOnlySink<TakeawayItemSnapshot>;
  readonly statusEvents: AppendOnlySink<StatusEvent>;
  readonly auditEvents: AppendOnlySink<AuditEvent>;
  readonly outbox: AppendOnlySink<OutboxEvent>;
  /**
   * When present, the one call that writes a submission. Durable deps must
   * supply this — see `createPostgresTakeawayDeps`. Its absence means the
   * sequential fallback, which only the in-memory stores may rely on.
   */
  readonly persistSubmission?: TakeawaySubmissionPersistence;
  readonly generateId: () => string;
  readonly now?: () => Date;
}

/** Builds the review and issues a token bound to its exact contents — no persistence yet. */
export async function prepareTakeawayRequest(
  deps: Pick<TakeawayServiceDeps, 'getMenuView' | 'confirmationTokens' | 'now'>,
  input: PrepareTakeawayRequestInput,
): Promise<Result<PrepareTakeawayRequestResult, AppError>> {
  const menuView = await deps.getMenuView();
  if (menuView.status !== 'PUBLISHED') return err(featureDisabled());

  const reviewResult = buildReview(input.cart, menuView, input);
  if (!reviewResult.ok) return reviewResult;

  const { rawToken } = await issueConfirmationToken(deps.confirmationTokens, {
    sessionId: input.sessionId,
    action: 'TAKEAWAY_REQUEST',
    reviewHash: hashReview(reviewResult.value),
    ttlSeconds: input.tokenTtlSeconds ?? 900,
    now: deps.now,
  });

  return ok({ review: reviewResult.value, confirmationToken: rawToken });
}

export interface SubmitTakeawayRequestInput {
  readonly sessionId: string;
  readonly cart: Cart;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedCollectionNote?: string | null;
  readonly notes?: string | null;
  readonly sourceChannel: SourceChannel;
  readonly confirmationToken: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface SubmitTakeawayRequestResult {
  readonly requestId: string;
  readonly state: 'REQUESTED';
}

/**
 * Recomputes the review fresh from the *current* published menu (step 3),
 * then hands that hash to `consumeConfirmationToken` — if the menu changed
 * since `prepareTakeawayRequest`, the hash will not match the token's
 * stored one and this fails `STALE_REVIEW`, exactly as designed.
 */
export async function submitTakeawayRequest(
  deps: TakeawayServiceDeps,
  input: SubmitTakeawayRequestInput,
): Promise<Result<SubmitTakeawayRequestResult, AppError>> {
  const now = deps.now ?? (() => new Date());
  const actor: Actor = { type: 'GUEST', id: input.sessionId };

  return runIdempotent(
    deps.idempotency,
    {
      scope: `${input.sessionId}:submitTakeawayRequest`,
      key: input.idempotencyKey,
      fingerprint: input.confirmationToken,
      correlationId: input.correlationId,
      now,
    },
    async (): Promise<Result<SubmitTakeawayRequestResult, AppError>> => {
      /*
       * An empty cart cannot become a request. The guard lives *inside* the
       * idempotent function on purpose: `runIdempotent` returns a completed
       * key's stored result without running this at all, so a genuine replay
       * — where the cart has already been cleared by the first success — is
       * unaffected, while a real submit with nothing in it is still refused.
       *
       * `buildReview` does not reject an empty cart (the review route guards
       * that separately), so without this an empty cart would produce a
       * request with no lines.
       */
      if (input.cart.lines.length === 0) {
        return err(validationFailed([{ path: 'cart', code: 'empty_cart' }], input.correlationId));
      }

      const menuView = await deps.getMenuView();
      if (menuView.status !== 'PUBLISHED') return err(featureDisabled(input.correlationId));

      const reviewResult = buildReview(input.cart, menuView, input);
      if (!reviewResult.ok) return reviewResult;

      const tokenResult = await consumeConfirmationToken(deps.confirmationTokens, {
        rawToken: input.confirmationToken,
        sessionId: input.sessionId,
        action: 'TAKEAWAY_REQUEST',
        reviewHash: hashReview(reviewResult.value),
        now,
        correlationId: input.correlationId,
      });
      if (!tokenResult.ok) return tokenResult;

      const requestId = deps.generateId();
      const { totals } = reviewResult.value;
      const record: TakeawayRequestRecord = {
        id: requestId,
        version: 1,
        state: 'REQUESTED',
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        menuVersionNumber: menuView.versionNumber,
        subtotalPkr: totals.subtotalPkr,
        adjustmentsPkr: 0,
        totalPkr: totals.subtotalPkr,
        requestedCollectionNote: input.requestedCollectionNote ?? null,
        notes: input.notes ?? null,
        sessionId: input.sessionId,
        sourceChannel: input.sourceChannel,
        assignedStaffId: null,
        createdAt: now().toISOString(),
      };
      const write: TakeawaySubmissionWrite = {
        request: record,
        items: totals.lines.map((line) => ({
          id: deps.generateId(),
          takeawayRequestId: requestId,
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          name: line.name,
          variantLabel: line.variantLabel,
          unitPricePkr: line.unitPricePkr,
          quantity: line.quantity,
          lineTotalPkr: line.lineTotalPkr,
        })),
        statusEvent: buildStatusEvent({
          entityType: 'TAKEAWAY_REQUEST',
          entityId: requestId,
          previousState: null,
          newState: record.state,
          actor,
          requestVersion: record.version,
          correlationId: input.correlationId,
          now,
        }),
        auditEvent: buildAuditEvent({
          category: 'ADMIN',
          action: 'takeaway_request.submitted',
          actor,
          targetType: 'TAKEAWAY_REQUEST',
          targetId: requestId,
          correlationId: input.correlationId,
          now,
        }),
        outboxEvent: buildOutboxEvent({
          eventType: 'takeaway_request.requested',
          entityType: 'TAKEAWAY_REQUEST',
          entityId: requestId,
          payload: { totalPkr: record.totalPkr, itemCount: totals.lines.length },
          destination: 'staff_notification',
          generateId: deps.generateId,
          now,
        }),
      };

      /*
       * One commit when the deps can give us one.
       *
       * The sequential branch below is five independent writes. Against
       * in-memory `Map`s that is fine — there is no failure mode between
       * them. Against Postgres over PostgREST it is five HTTP round-trips
       * with no transaction, where a failure after the first leaves a
       * request that has no lines, no history, or — worst — no outbox event,
       * meaning an order exists that staff are never notified about.
       *
       * So durable deps supply `persistSubmission` and this whole block
       * becomes a single `takeaway_submit_request` call. Anything thrown
       * propagates out of `runIdempotent`, which marks the key FAILED, so a
       * later retry is a clean attempt rather than a replay of a half-write.
       */
      if (deps.persistSubmission) {
        await deps.persistSubmission.persist(write);
      } else {
        await deps.requestStore.create(write.request);
        for (const item of write.items) await deps.itemSnapshots.append(item);
        await deps.statusEvents.append(write.statusEvent);
        await deps.auditEvents.append(write.auditEvent);
        await deps.outbox.append(write.outboxEvent);
      }

      return ok({ requestId, state: 'REQUESTED' });
    },
  );
}
