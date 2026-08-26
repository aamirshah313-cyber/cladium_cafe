/**
 * Staff-facing event queue/transition/assignment service — Runbook Step 24.
 * Same shape as `modules/takeaway/staff-service.ts` — see that file's doc
 * comment, including why `deps` is an explicit parameter rather than the
 * `eventDeps` singleton. One addition: transitioning to `QUOTED` must carry
 * `quotedAmountPkr` (data-model-v2.md §5 — "the public starting décor
 * statement does not create or guarantee a quote"; a real number is only
 * ever written here, by staff, never computed or defaulted).
 * `performStaffTransition`'s `additionalPatch` writes it atomically
 * alongside the state change.
 */

import { ok, err, type Result } from '../../lib/result';
import { forbidden, notFound, validationFailed, type AppError } from '../../lib/errors';
import { assertServerOnly } from '../../lib/server-only';
import type { Actor } from '../../lib/domain/actor';
import { hasAnyRole } from '../../lib/domain/actor';
import { performStaffAssignment, performStaffTransition } from '../../lib/domain/staff-transition';
import type { AppendOnlySink } from '../../lib/domain/sink';
import type { StatusEvent } from '../../lib/domain/status-event';
import type { AuditEvent } from '../../lib/domain/audit-event';
import type { OutboxEvent } from '../../lib/domain/outbox';
import type { VersionedStore } from '../../lib/domain/versioned-store';
import { matchesRequestFilter, type RequestFilter } from '../staff/filter';
import {
  EVENT_REASON_REQUIRED_STATES,
  EVENT_STAFF_ROLES,
  EVENT_VIEWER_ROLES,
  eventStateMachine,
  type EventState,
} from './state-machine';
import type { EventRequestRecord } from './request';

assertServerOnly('src/modules/events/staff-service.ts');

export interface EventStaffDeps {
  readonly requestStore: VersionedStore<EventRequestRecord>;
  readonly statusEvents: AppendOnlySink<StatusEvent>;
  readonly auditEvents: AppendOnlySink<AuditEvent>;
  readonly outbox: AppendOnlySink<OutboxEvent>;
}

export async function listEventRequests(
  deps: Pick<EventStaffDeps, 'requestStore'>,
  actor: Actor,
  filter: RequestFilter<EventState> = {},
  correlationId?: string,
): Promise<Result<readonly EventRequestRecord[], AppError>> {
  if (!hasAnyRole(actor, EVENT_VIEWER_ROLES)) return err(forbidden(correlationId));
  const all = await deps.requestStore.list();
  return ok(all.filter((record) => matchesRequestFilter(record, filter)));
}

export interface EventRequestDetail {
  readonly record: EventRequestRecord;
  readonly history: readonly StatusEvent[];
}

export async function getEventRequestDetail(
  deps: Pick<EventStaffDeps, 'requestStore' | 'statusEvents'>,
  actor: Actor,
  entityId: string,
  correlationId?: string,
): Promise<Result<EventRequestDetail, AppError>> {
  if (!hasAnyRole(actor, EVENT_VIEWER_ROLES)) return err(forbidden(correlationId));
  const record = await deps.requestStore.find(entityId);
  if (!record) return err(notFound(correlationId));

  const allHistory = await deps.statusEvents.list();
  return ok({ record, history: allHistory.filter((event) => event.entityId === entityId) });
}

export interface TransitionEventRequestInput {
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly newState: EventState;
  /** Required when `newState` is `QUOTED`; ignored otherwise. */
  readonly quotedAmountPkr?: number;
  readonly reasonCode?: string;
  readonly reasonNote?: string;
  readonly correlationId: string;
}

export function transitionEventRequest(
  deps: EventStaffDeps,
  actor: Actor,
  input: TransitionEventRequestInput,
): Promise<Result<EventRequestRecord, AppError>> {
  if (
    input.newState === 'QUOTED' &&
    !(Number.isInteger(input.quotedAmountPkr) && (input.quotedAmountPkr as number) >= 0)
  ) {
    return Promise.resolve(
      err(validationFailed([{ path: 'quotedAmountPkr', code: 'required' }], input.correlationId)),
    );
  }

  return performStaffTransition({
    entityType: 'EVENT_REQUEST',
    store: deps.requestStore,
    stateMachine: eventStateMachine,
    allowedRoles: EVENT_STAFF_ROLES,
    reasonRequiredStates: EVENT_REASON_REQUIRED_STATES,
    actor,
    entityId: input.entityId,
    expectedVersion: input.expectedVersion,
    newState: input.newState,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    correlationId: input.correlationId,
    statusEvents: deps.statusEvents,
    auditEvents: deps.auditEvents,
    outbox: deps.outbox,
    additionalPatch:
      input.newState === 'QUOTED' ? { quotedAmountPkr: input.quotedAmountPkr } : undefined,
  });
}

export interface AssignEventRequestInput {
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly assignedStaffId: string | null;
  readonly correlationId: string;
}

export function assignEventRequest(
  deps: Pick<EventStaffDeps, 'requestStore' | 'auditEvents'>,
  actor: Actor,
  input: AssignEventRequestInput,
): Promise<Result<EventRequestRecord, AppError>> {
  return performStaffAssignment({
    entityType: 'EVENT_REQUEST',
    store: deps.requestStore,
    allowedRoles: EVENT_STAFF_ROLES,
    actor,
    entityId: input.entityId,
    expectedVersion: input.expectedVersion,
    assignedStaffId: input.assignedStaffId,
    correlationId: input.correlationId,
    auditEvents: deps.auditEvents,
  });
}
