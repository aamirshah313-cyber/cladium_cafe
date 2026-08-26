/**
 * Event state machine — Runbook Step 19.
 *
 * Exactly data-model-v2.md §5 / tool-contracts.md's diagram:
 *
 * ```text
 * ENQUIRY → REQUESTED → QUOTED → CUSTOMER_ACCEPTED → CONFIRMED
 *    └────────────── applicable pre-confirmation states ─────────→ CANCELLED
 * ```
 *
 * "Only staff can set QUOTED and CONFIRMED. A customer acceptance is not
 * final confirmation" — `QUOTED → CUSTOMER_ACCEPTED` is the one transition
 * in this whole domain a *guest* actor performs (accepting a staff quote),
 * not staff; every other non-creation transition is staff-only, same as
 * takeaway/booking. No tool contract yet requests "accept quote" as a
 * capability (`agent/tool-contracts.md`'s tool list has none), so
 * `performStaffTransition` (built for the staff-only case) is not used for
 * it and no submission/acceptance service is built here — this module only
 * records the state machine correctly for when that service exists.
 */

import type { StaffRole } from '../../lib/domain/actor';
import type { StateMachine } from '../../lib/domain/state-machine';

export type EventState =
  'ENQUIRY' | 'REQUESTED' | 'QUOTED' | 'CUSTOMER_ACCEPTED' | 'CONFIRMED' | 'CANCELLED';

export const EVENT_STATES: readonly EventState[] = [
  'ENQUIRY',
  'REQUESTED',
  'QUOTED',
  'CUSTOMER_ACCEPTED',
  'CONFIRMED',
  'CANCELLED',
];

/** The only state a guest submission may create a row in. */
export const EVENT_CUSTOMER_CREATABLE_STATE: EventState = 'REQUESTED';

/** The one transition a GUEST actor performs, not staff — see module doc comment. */
export const EVENT_CUSTOMER_TRANSITION: { readonly from: EventState; readonly to: EventState } = {
  from: 'QUOTED',
  to: 'CUSTOMER_ACCEPTED',
};

/** No dedicated "event staff" role exists in the initial five (data-model-v2.md §6); events are Booking Staff's scope alongside Owner/Manager. */
export const EVENT_STAFF_ROLES: readonly StaffRole[] = ['OWNER', 'MANAGER', 'BOOKING_STAFF'];

export const eventStateMachine: StateMachine<EventState> = {
  transitions: {
    ENQUIRY: ['REQUESTED', 'CANCELLED'],
    REQUESTED: ['QUOTED', 'CANCELLED'],
    QUOTED: ['CUSTOMER_ACCEPTED', 'CANCELLED'],
    CUSTOMER_ACCEPTED: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: [],
    CANCELLED: [],
  },
};
