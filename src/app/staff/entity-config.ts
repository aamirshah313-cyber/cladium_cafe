/**
 * Client-safe UI metadata for the three staff-workable entities — Runbook
 * Step 24. Deliberately duplicates (rather than imports) the transition
 * state lists already defined server-side in `modules/staff/schemas.ts` —
 * that module pulls in `zod`/server-only domain types and must never reach
 * a client bundle; this file is the client-side mirror, and the server
 * schemas remain the actual authority (a mismatch here only ever produces a
 * rejected request, never an unsafe one).
 */

export type StaffEntityKey = 'takeaway' | 'bookings' | 'events';

export const STAFF_ENTITY_KEYS: readonly StaffEntityKey[] = ['takeaway', 'bookings', 'events'];

export function isStaffEntityKey(value: string): value is StaffEntityKey {
  return (STAFF_ENTITY_KEYS as readonly string[]).includes(value);
}

export interface StaffEntityUiConfig {
  readonly key: StaffEntityKey;
  readonly label: string;
  readonly apiBase: string;
  /** Every state a queue filter may select — includes non-staff-settable states like `REQUESTED` that a request can already be in. */
  readonly allStates: readonly string[];
  /** States a staff transition may target — narrower than `allStates` (excludes `REQUESTED`, and for events, guest-performed `CUSTOMER_ACCEPTED`). */
  readonly transitionStates: readonly string[];
  readonly reasonRequiredStates: readonly string[];
  readonly hasQuote: boolean;
}

export const STAFF_ENTITY_CONFIG: Record<StaffEntityKey, StaffEntityUiConfig> = {
  takeaway: {
    key: 'takeaway',
    label: 'Takeaway',
    apiBase: '/api/staff/takeaway',
    allStates: [
      'REQUESTED',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'COLLECTED',
      'REJECTED',
      'CANCELLED',
    ],
    transitionStates: ['ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'REJECTED', 'CANCELLED'],
    reasonRequiredStates: ['REJECTED', 'CANCELLED'],
    hasQuote: false,
  },
  bookings: {
    key: 'bookings',
    label: 'Bookings',
    apiBase: '/api/staff/bookings',
    allStates: [
      'REQUESTED',
      'CONFIRMED',
      'SEATED',
      'COMPLETED',
      'DECLINED',
      'CANCELLED',
      'NO_SHOW',
    ],
    transitionStates: ['CONFIRMED', 'SEATED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'NO_SHOW'],
    reasonRequiredStates: ['DECLINED', 'CANCELLED', 'NO_SHOW'],
    hasQuote: false,
  },
  events: {
    key: 'events',
    label: 'Events',
    apiBase: '/api/staff/events',
    allStates: ['REQUESTED', 'QUOTED', 'CUSTOMER_ACCEPTED', 'CONFIRMED', 'CANCELLED'],
    transitionStates: ['QUOTED', 'CONFIRMED', 'CANCELLED'],
    reasonRequiredStates: ['CANCELLED'],
    hasQuote: true,
  },
};
