/**
 * Staff-facing booking queue/transition/assignment service — Runbook
 * Step 24. Same shape as `modules/takeaway/staff-service.ts` — see that
 * file's doc comment, including why `deps` is an explicit parameter rather
 * than the `bookingDeps` singleton. Booking has no snapshot-line
 * equivalent, so its detail view is just the record plus status history.
 */

import { ok, err, type Result } from '../../lib/result';
import { forbidden, notFound, type AppError } from '../../lib/errors';
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
  BOOKING_REASON_REQUIRED_STATES,
  BOOKING_STAFF_ROLES,
  BOOKING_VIEWER_ROLES,
  bookingStateMachine,
  type BookingState,
} from './state-machine';
import type { BookingRequestRecord } from './request';

assertServerOnly('src/modules/bookings/staff-service.ts');

export interface BookingStaffDeps {
  readonly requestStore: VersionedStore<BookingRequestRecord>;
  readonly statusEvents: AppendOnlySink<StatusEvent>;
  readonly auditEvents: AppendOnlySink<AuditEvent>;
  readonly outbox: AppendOnlySink<OutboxEvent>;
}

export async function listBookingRequests(
  deps: Pick<BookingStaffDeps, 'requestStore'>,
  actor: Actor,
  filter: RequestFilter<BookingState> = {},
  correlationId?: string,
): Promise<Result<readonly BookingRequestRecord[], AppError>> {
  if (!hasAnyRole(actor, BOOKING_VIEWER_ROLES)) return err(forbidden(correlationId));
  const all = await deps.requestStore.list();
  return ok(all.filter((record) => matchesRequestFilter(record, filter)));
}

export interface BookingRequestDetail {
  readonly record: BookingRequestRecord;
  readonly history: readonly StatusEvent[];
}

export async function getBookingRequestDetail(
  deps: Pick<BookingStaffDeps, 'requestStore' | 'statusEvents'>,
  actor: Actor,
  entityId: string,
  correlationId?: string,
): Promise<Result<BookingRequestDetail, AppError>> {
  if (!hasAnyRole(actor, BOOKING_VIEWER_ROLES)) return err(forbidden(correlationId));
  const record = await deps.requestStore.find(entityId);
  if (!record) return err(notFound(correlationId));

  const allHistory = await deps.statusEvents.list();
  return ok({ record, history: allHistory.filter((event) => event.entityId === entityId) });
}

export interface TransitionBookingRequestInput {
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly newState: BookingState;
  readonly reasonCode?: string;
  readonly reasonNote?: string;
  readonly correlationId: string;
}

export function transitionBookingRequest(
  deps: BookingStaffDeps,
  actor: Actor,
  input: TransitionBookingRequestInput,
): Promise<Result<BookingRequestRecord, AppError>> {
  return performStaffTransition({
    entityType: 'BOOKING_REQUEST',
    store: deps.requestStore,
    stateMachine: bookingStateMachine,
    allowedRoles: BOOKING_STAFF_ROLES,
    reasonRequiredStates: BOOKING_REASON_REQUIRED_STATES,
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

export interface AssignBookingRequestInput {
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly assignedStaffId: string | null;
  readonly correlationId: string;
}

export function assignBookingRequest(
  deps: Pick<BookingStaffDeps, 'requestStore' | 'auditEvents'>,
  actor: Actor,
  input: AssignBookingRequestInput,
): Promise<Result<BookingRequestRecord, AppError>> {
  return performStaffAssignment({
    entityType: 'BOOKING_REQUEST',
    store: deps.requestStore,
    allowedRoles: BOOKING_STAFF_ROLES,
    actor,
    entityId: input.entityId,
    expectedVersion: input.expectedVersion,
    assignedStaffId: input.assignedStaffId,
    correlationId: input.correlationId,
    auditEvents: deps.auditEvents,
  });
}
