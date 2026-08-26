/**
 * Takeaway state machine — Runbook Step 19.
 *
 * Exactly data-model-v2.md §5 / tool-contracts.md's diagram:
 *
 * ```text
 * DRAFT → REQUESTED → ACCEPTED → PREPARING → READY → COLLECTED
 *                    └──────────────→ REJECTED
 * REQUESTED/ACCEPTED/PREPARING → CANCELLED
 * ```
 *
 * `DRAFT` is in the table for schema fidelity (the database enum includes
 * it), but the actual guest submission path never uses it: "Customer
 * submission creates REQUESTED; it never creates ACCEPTED or CONFIRMED"
 * (data-model-v2.md §5) — `submission-service.ts` creates rows directly in
 * `REQUESTED`, matching §7's transaction contract exactly.
 */

import type { StaffRole } from '../../lib/domain/actor';
import type { StateMachine } from '../../lib/domain/state-machine';

export type TakeawayState =
  | 'DRAFT'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COLLECTED'
  | 'REJECTED'
  | 'CANCELLED';

export const TAKEAWAY_STATES: readonly TakeawayState[] = [
  'DRAFT',
  'REQUESTED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COLLECTED',
  'REJECTED',
  'CANCELLED',
];

/** The only state a guest submission may create a row in. */
export const TAKEAWAY_CUSTOMER_CREATABLE_STATE: TakeawayState = 'REQUESTED';

/** OWNER/MANAGER have superset authority; ORDER_STAFF is the day-to-day operator role. AUDITOR is deliberately excluded (read-only by design — Step 10). */
export const TAKEAWAY_STAFF_ROLES: readonly StaffRole[] = ['OWNER', 'MANAGER', 'ORDER_STAFF'];

/** Step 24: who may *view* the takeaway queue/history — the transition roles plus AUDITOR, who reads everything but writes nothing (Step 10). */
export const TAKEAWAY_VIEWER_ROLES: readonly StaffRole[] = [...TAKEAWAY_STAFF_ROLES, 'AUDITOR'];

/** Step 24's "mandatory reasons where needed": a negative outcome must be explained; a positive-progression transition needs no reason. */
export const TAKEAWAY_REASON_REQUIRED_STATES: readonly TakeawayState[] = ['REJECTED', 'CANCELLED'];

export const takeawayStateMachine: StateMachine<TakeawayState> = {
  transitions: {
    DRAFT: ['REQUESTED'],
    REQUESTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['COLLECTED'],
    COLLECTED: [],
    REJECTED: [],
    CANCELLED: [],
  },
};
