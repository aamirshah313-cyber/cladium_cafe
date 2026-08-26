import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal } from '../../src/lib/domain/state-machine';
import {
  BOOKING_CUSTOMER_CREATABLE_STATE,
  BOOKING_STAFF_ROLES,
  BOOKING_STATES,
  bookingStateMachine,
  type BookingState,
} from '../../src/modules/bookings/state-machine';

const EXPECTED: Record<BookingState, readonly BookingState[]> = {
  DRAFT: ['REQUESTED'],
  REQUESTED: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

describe('bookingStateMachine — exhaustive transition table', () => {
  for (const from of BOOKING_STATES) {
    for (const to of BOOKING_STATES) {
      const expected = EXPECTED[from].includes(to);
      it(`${from} -> ${to} is ${expected ? 'legal' : 'illegal'}`, () => {
        expect(canTransition(bookingStateMachine, from, to)).toBe(expected);
      });
    }
  }
});

describe('bookingStateMachine — terminal states', () => {
  it.each(['COMPLETED', 'DECLINED', 'CANCELLED', 'NO_SHOW'] as const)('%s is terminal', (state) => {
    expect(isTerminal(bookingStateMachine, state)).toBe(true);
  });

  it.each(['DRAFT', 'REQUESTED', 'CONFIRMED', 'SEATED'] as const)('%s is not terminal', (state) => {
    expect(isTerminal(bookingStateMachine, state)).toBe(false);
  });
});

describe('booking customer-creation and role scope', () => {
  it('customer submissions are only ever created REQUESTED — a requested time is not availability', () => {
    expect(BOOKING_CUSTOMER_CREATABLE_STATE).toBe('REQUESTED');
  });

  it('AUDITOR cannot perform transitions', () => {
    expect(BOOKING_STAFF_ROLES).not.toContain('AUDITOR');
  });

  it('BOOKING_STAFF, MANAGER, and OWNER can', () => {
    expect(BOOKING_STAFF_ROLES).toEqual(
      expect.arrayContaining(['BOOKING_STAFF', 'MANAGER', 'OWNER']),
    );
  });
});
