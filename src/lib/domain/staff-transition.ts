/**
 * Generic staff state transition — Runbook Step 19.
 *
 * Implements data-model-v2.md §7 "Staff state transition" exactly, once,
 * for all three request types: authenticate/authorize the staff actor,
 * lock the record and compare its expected version, validate the
 * transition against the entity's state machine, update state+version,
 * append status/audit events, and optionally enqueue an outbox
 * notification — all in the order the spec lists them. Each of
 * `modules/{takeaway,bookings,events}` supplies its own state machine,
 * store, and allowed roles rather than reimplementing this orchestration
 * three times.
 *
 * `reasonRequiredStates` was added in Runbook Step 24 for its own "mandatory
 * reasons where needed" requirement — enforced here, once, rather than in
 * each of the three staff services that call this function.
 */

import { err, ok, type Result } from '../result';
import { conflict, forbidden, notFound, validationFailed, type AppError } from '../errors';
import { hasAnyRole, type Actor, type StaffRole } from './actor';
import { canTransition, type StateMachine } from './state-machine';
import { buildAuditEvent, type AuditEvent } from './audit-event';
import { buildOutboxEvent, type BuildOutboxEventInput, type OutboxEvent } from './outbox';
import { buildStatusEvent, type EntityType, type StatusEvent } from './status-event';
import type { AppendOnlySink } from './sink';
import type { VersionedRecord, VersionedStore } from './versioned-store';

export interface PerformStaffTransitionInput<
  T extends VersionedRecord & { readonly state: S },
  S extends string,
> {
  readonly entityType: EntityType;
  readonly store: VersionedStore<T>;
  readonly stateMachine: StateMachine<S>;
  readonly allowedRoles: readonly StaffRole[];
  readonly actor: Actor;
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly newState: S;
  readonly reasonCode?: string;
  readonly reasonNote?: string;
  /**
   * Runbook Step 24's "mandatory reasons where needed": a negative-outcome
   * transition (reject/decline/cancel/no-show) must carry a non-blank
   * `reasonCode`, checked before anything is written. Positive-progression
   * transitions need no reason, so callers only list the states that do.
   */
  readonly reasonRequiredStates?: readonly S[];
  /**
   * Extra fields to write alongside the state change — e.g. events'
   * `REQUESTED → QUOTED` also sets `quotedAmountPkr` (Step 24). Applied in
   * the same `updateIfVersionMatches` call as the state change, so both
   * land together or neither does.
   */
  readonly additionalPatch?: Partial<Omit<T, 'id' | 'version' | 'state'>>;
  readonly correlationId: string;
  readonly statusEvents: AppendOnlySink<StatusEvent>;
  readonly auditEvents: AppendOnlySink<AuditEvent>;
  readonly outbox: AppendOnlySink<OutboxEvent>;
  /** Returning `null` skips the notification for this particular transition. */
  readonly buildOutboxNotification?: (record: T) => Omit<BuildOutboxEventInput, 'now'> | null;
  readonly now?: () => Date;
}

export async function performStaffTransition<
  T extends VersionedRecord & { readonly state: S },
  S extends string,
>(input: PerformStaffTransitionInput<T, S>): Promise<Result<T, AppError>> {
  // 1. authenticate/authorize.
  if (!hasAnyRole(input.actor, input.allowedRoles)) {
    return err(forbidden(input.correlationId));
  }

  // 2. lock/load and compare expected version.
  const existing = await input.store.find(input.entityId);
  if (!existing) return err(notFound(input.correlationId));
  if (existing.version !== input.expectedVersion) return err(conflict(input.correlationId));

  // 3. validate the transition.
  if (!canTransition(input.stateMachine, existing.state, input.newState)) {
    return err(
      validationFailed([{ path: 'state', code: 'illegal_transition' }], input.correlationId),
    );
  }
  if ((input.reasonRequiredStates ?? []).includes(input.newState) && !input.reasonCode?.trim()) {
    return err(validationFailed([{ path: 'reasonCode', code: 'required' }], input.correlationId));
  }

  // 4. update state + version (optimistic lock re-checked here too, closing
  // the race between steps 2 and 4 without needing a real DB transaction).
  const updated = await input.store.updateIfVersionMatches(input.entityId, input.expectedVersion, {
    ...input.additionalPatch,
    state: input.newState,
  } as Partial<Omit<T, 'id' | 'version'>>);
  if (!updated) return err(conflict(input.correlationId));

  // 5. append status + audit events.
  await input.statusEvents.append(
    buildStatusEvent({
      entityType: input.entityType,
      entityId: input.entityId,
      previousState: existing.state,
      newState: input.newState,
      actor: input.actor,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      requestVersion: updated.version,
      correlationId: input.correlationId,
      now: input.now,
    }),
  );
  await input.auditEvents.append(
    buildAuditEvent({
      category: 'ADMIN',
      action: `${input.entityType.toLowerCase()}.state_transition`,
      actor: input.actor,
      targetType: input.entityType,
      targetId: input.entityId,
      correlationId: input.correlationId,
      now: input.now,
    }),
  );

  // 6. enqueue a notification, if this transition warrants one.
  const notification = input.buildOutboxNotification?.(updated) ?? null;
  if (notification) {
    await input.outbox.append(buildOutboxEvent({ ...notification, now: input.now }));
  }

  return ok(updated);
}

export interface PerformStaffAssignmentInput<T extends VersionedRecord> {
  readonly entityType: EntityType;
  readonly store: VersionedStore<T>;
  readonly allowedRoles: readonly StaffRole[];
  readonly actor: Actor;
  readonly entityId: string;
  readonly expectedVersion: number;
  /** `null` explicitly unassigns rather than leaving the current assignee. */
  readonly assignedStaffId: string | null;
  readonly correlationId: string;
  readonly auditEvents: AppendOnlySink<AuditEvent>;
  readonly now?: () => Date;
}

/**
 * Assignment is metadata, not a state change — no state-machine validation,
 * no status event (nothing about the request's lifecycle changed), no
 * outbox notification. Still authorized, version-locked, and audited, same
 * as `performStaffTransition` — Runbook Step 24.
 */
export async function performStaffAssignment<
  T extends VersionedRecord & { readonly assignedStaffId: string | null },
>(input: PerformStaffAssignmentInput<T>): Promise<Result<T, AppError>> {
  if (!hasAnyRole(input.actor, input.allowedRoles)) {
    return err(forbidden(input.correlationId));
  }

  const existing = await input.store.find(input.entityId);
  if (!existing) return err(notFound(input.correlationId));
  if (existing.version !== input.expectedVersion) return err(conflict(input.correlationId));

  const updated = await input.store.updateIfVersionMatches(input.entityId, input.expectedVersion, {
    assignedStaffId: input.assignedStaffId,
  } as Partial<Omit<T, 'id' | 'version'>>);
  if (!updated) return err(conflict(input.correlationId));

  await input.auditEvents.append(
    buildAuditEvent({
      category: 'ADMIN',
      action: `${input.entityType.toLowerCase()}.assigned`,
      actor: input.actor,
      targetType: input.entityType,
      targetId: input.entityId,
      correlationId: input.correlationId,
      now: input.now,
    }),
  );

  return ok(updated);
}
