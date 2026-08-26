import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal } from '../../src/lib/domain/state-machine';
import {
  EVENT_CUSTOMER_CREATABLE_STATE,
  EVENT_CUSTOMER_TRANSITION,
  EVENT_STAFF_ROLES,
  EVENT_STATES,
  eventStateMachine,
  type EventState,
} from '../../src/modules/events/state-machine';

const EXPECTED: Record<EventState, readonly EventState[]> = {
  ENQUIRY: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['QUOTED', 'CANCELLED'],
  QUOTED: ['CUSTOMER_ACCEPTED', 'CANCELLED'],
  CUSTOMER_ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: [],
  CANCELLED: [],
};

describe('eventStateMachine — exhaustive transition table', () => {
  for (const from of EVENT_STATES) {
    for (const to of EVENT_STATES) {
      const expected = EXPECTED[from].includes(to);
      it(`${from} -> ${to} is ${expected ? 'legal' : 'illegal'}`, () => {
        expect(canTransition(eventStateMachine, from, to)).toBe(expected);
      });
    }
  }
});

describe('eventStateMachine — terminal states', () => {
  it.each(['CONFIRMED', 'CANCELLED'] as const)('%s is terminal', (state) => {
    expect(isTerminal(eventStateMachine, state)).toBe(true);
  });

  it.each(['ENQUIRY', 'REQUESTED', 'QUOTED', 'CUSTOMER_ACCEPTED'] as const)(
    '%s is not terminal',
    (state) => {
      expect(isTerminal(eventStateMachine, state)).toBe(false);
    },
  );
});

describe('event customer-creation, guest transition, and role scope', () => {
  it('customer submissions are only ever created REQUESTED', () => {
    expect(EVENT_CUSTOMER_CREATABLE_STATE).toBe('REQUESTED');
  });

  it('the one guest-performed transition is QUOTED -> CUSTOMER_ACCEPTED, still legal in the state machine', () => {
    expect(EVENT_CUSTOMER_TRANSITION).toEqual({ from: 'QUOTED', to: 'CUSTOMER_ACCEPTED' });
    expect(canTransition(eventStateMachine, 'QUOTED', 'CUSTOMER_ACCEPTED')).toBe(true);
  });

  it('AUDITOR cannot perform transitions', () => {
    expect(EVENT_STAFF_ROLES).not.toContain('AUDITOR');
  });

  it('no dedicated event-staff role exists — BOOKING_STAFF, MANAGER, and OWNER cover it', () => {
    expect(EVENT_STAFF_ROLES).toEqual(
      expect.arrayContaining(['BOOKING_STAFF', 'MANAGER', 'OWNER']),
    );
  });
});
