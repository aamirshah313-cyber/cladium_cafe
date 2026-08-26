/**
 * Booking state machine — Runbook Step 19.
 *
 * Exactly data-model-v2.md §5 / tool-contracts.md's diagram:
 *
 * ```text
 * DRAFT → REQUESTED → CONFIRMED → SEATED → COMPLETED
 *                    └────────→ DECLINED
 * REQUESTED/CONFIRMED → CANCELLED
 * CONFIRMED → NO_SHOW
 * ```
 *
 * "Only authorized staff can set CONFIRMED, DECLINED, SEATED, COMPLETED, or
 * NO_SHOW" — no guest-facing cancel tool exists either (tool-contracts.md),
 * so every non-creation transition, including CANCELLED, is staff-only.
 */

import type { StaffRole } from '../../lib/domain/actor';
import type { StateMachine } from '../../lib/domain/state-machine';

export type BookingState =
  | 'DRAFT'
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'NO_SHOW';

export const BOOKING_STATES: readonly BookingState[] = [
  'DRAFT',
  'REQUESTED',
  'CONFIRMED',
  'SEATED',
  'COMPLETED',
  'DECLINED',
  'CANCELLED',
  'NO_SHOW',
];

/** The only state a guest submission may create a row in. A requested time is not availability. */
export const BOOKING_CUSTOMER_CREATABLE_STATE: BookingState = 'REQUESTED';

export const BOOKING_STAFF_ROLES: readonly StaffRole[] = ['OWNER', 'MANAGER', 'BOOKING_STAFF'];

/** Step 24: who may *view* the booking queue/history — the transition roles plus AUDITOR, who reads everything but writes nothing (Step 10). */
export const BOOKING_VIEWER_ROLES: readonly StaffRole[] = [...BOOKING_STAFF_ROLES, 'AUDITOR'];

/** Step 24's "mandatory reasons where needed": a negative outcome must be explained; a positive-progression transition needs no reason. */
export const BOOKING_REASON_REQUIRED_STATES: readonly BookingState[] = [
  'DECLINED',
  'CANCELLED',
  'NO_SHOW',
];

export const bookingStateMachine: StateMachine<BookingState> = {
  transitions: {
    DRAFT: ['REQUESTED'],
    REQUESTED: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
    CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
    SEATED: ['COMPLETED'],
    COMPLETED: [],
    DECLINED: [],
    CANCELLED: [],
    NO_SHOW: [],
  },
};
