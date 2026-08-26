/**
 * Staff-facing takeaway queue/transition/assignment service — Runbook
 * Step 24.
 *
 * Thin, entity-specific wiring over the two shared orchestrators
 * (`performStaffTransition`, `performStaffAssignment`) plus a read side
 * (`listRequests`, `getRequestDetail`) that Steps 19–21 never needed —
 * nothing before this step read more than one request at a time. Takes
 * `deps` explicitly, same as `submission-service.ts`'s functions, so tests
 * can supply an isolated in-memory harness instead of reaching into the
 * `takeawayDeps` process singleton; `app/api/staff/takeaway/*` routes pass
 * that singleton in explicitly, the same way `app/api/takeaway/*` routes do.
 */

import { ok, err, type Result } from '../../lib/result';
import { notFound, forbidden, type AppError } from '../../lib/errors';
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
  TAKEAWAY_REASON_REQUIRED_STATES,
  TAKEAWAY_STAFF_ROLES,
  TAKEAWAY_VIEWER_ROLES,
  takeawayStateMachine,
  type TakeawayState,
} from './state-machine';
import type { TakeawayItemSnapshot, TakeawayRequestRecord } from './request';

assertServerOnly('src/modules/takeaway/staff-service.ts');

export interface TakeawayStaffDeps {
  readonly requestStore: VersionedStore<TakeawayRequestRecord>;
  readonly itemSnapshots: AppendOnlySink<TakeawayItemSnapshot>;
  readonly statusEvents: AppendOnlySink<StatusEvent>;
  readonly auditEvents: AppendOnlySink<AuditEvent>;
  readonly outbox: AppendOnlySink<OutboxEvent>;
}

export async function listTakeawayRequests(
  deps: Pick<TakeawayStaffDeps, 'requestStore'>,
  actor: Actor,
  filter: RequestFilter<TakeawayState> = {},
  correlationId?: string,
): Promise<Result<readonly TakeawayRequestRecord[], AppError>> {
  if (!hasAnyRole(actor, TAKEAWAY_VIEWER_ROLES)) return err(forbidden(correlationId));
  const all = await deps.requestStore.list();
  return ok(all.filter((record) => matchesRequestFilter(record, filter)));
}

export interface TakeawayRequestDetail {
  readonly record: TakeawayRequestRecord;
  readonly items: readonly TakeawayItemSnapshot[];
  readonly history: readonly StatusEvent[];
}

export async function getTakeawayRequestDetail(
  deps: Pick<TakeawayStaffDeps, 'requestStore' | 'itemSnapshots' | 'statusEvents'>,
  actor: Actor,
  entityId: string,
  correlationId?: string,
): Promise<Result<TakeawayRequestDetail, AppError>> {
  if (!hasAnyRole(actor, TAKEAWAY_VIEWER_ROLES)) return err(forbidden(correlationId));
  const record = await deps.requestStore.find(entityId);
  if (!record) return err(notFound(correlationId));

  const allItems = await deps.itemSnapshots.list();
  const allHistory = await deps.statusEvents.list();
  return ok({
    record,
    items: allItems.filter((item) => item.takeawayRequestId === entityId),
    history: allHistory.filter((event) => event.entityId === entityId),
  });
}

export interface TransitionTakeawayRequestInput {
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly newState: TakeawayState;
  readonly reasonCode?: string;
  readonly reasonNote?: string;
  readonly correlationId: string;
}

export function transitionTakeawayRequest(
  deps: TakeawayStaffDeps,
  actor: Actor,
  input: TransitionTakeawayRequestInput,
): Promise<Result<TakeawayRequestRecord, AppError>> {
  return performStaffTransition({
    entityType: 'TAKEAWAY_REQUEST',
    store: deps.requestStore,
    stateMachine: takeawayStateMachine,
    allowedRoles: TAKEAWAY_STAFF_ROLES,
    reasonRequiredStates: TAKEAWAY_REASON_REQUIRED_STATES,
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
  });
}

export interface AssignTakeawayRequestInput {
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly assignedStaffId: string | null;
  readonly correlationId: string;
}

export function assignTakeawayRequest(
  deps: Pick<TakeawayStaffDeps, 'requestStore' | 'auditEvents'>,
  actor: Actor,
  input: AssignTakeawayRequestInput,
): Promise<Result<TakeawayRequestRecord, AppError>> {
  return performStaffAssignment({
    entityType: 'TAKEAWAY_REQUEST',
    store: deps.requestStore,
    allowedRoles: TAKEAWAY_STAFF_ROLES,
    actor,
    entityId: input.entityId,
    expectedVersion: input.expectedVersion,
    assignedStaffId: input.assignedStaffId,
    correlationId: input.correlationId,
    auditEvents: deps.auditEvents,
  });
}
