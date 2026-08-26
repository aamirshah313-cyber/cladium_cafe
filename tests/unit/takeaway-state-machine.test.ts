import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal } from '../../src/lib/domain/state-machine';
import {
  TAKEAWAY_CUSTOMER_CREATABLE_STATE,
  TAKEAWAY_STAFF_ROLES,
  TAKEAWAY_STATES,
  takeawayStateMachine,
  type TakeawayState,
} from '../../src/modules/takeaway/state-machine';

// The exact legal-transition set from data-model-v2.md §5 / tool-contracts.md,
// written out independently of `takeawayStateMachine`'s own table so this test
// can't just be asserting the implementation against itself.
const EXPECTED: Record<TakeawayState, readonly TakeawayState[]> = {
  DRAFT: ['REQUESTED'],
  REQUESTED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COLLECTED'],
  COLLECTED: [],
  REJECTED: [],
  CANCELLED: [],
};

describe('takeawayStateMachine — exhaustive transition table', () => {
  for (const from of TAKEAWAY_STATES) {
    for (const to of TAKEAWAY_STATES) {
      const expected = EXPECTED[from].includes(to);
      it(`${from} -> ${to} is ${expected ? 'legal' : 'illegal'}`, () => {
        expect(canTransition(takeawayStateMachine, from, to)).toBe(expected);
      });
    }
  }
});

describe('takeawayStateMachine — terminal states', () => {
  it.each(['COLLECTED', 'REJECTED', 'CANCELLED'] as const)('%s is terminal', (state) => {
    expect(isTerminal(takeawayStateMachine, state)).toBe(true);
  });

  it.each(['DRAFT', 'REQUESTED', 'ACCEPTED', 'PREPARING', 'READY'] as const)(
    '%s is not terminal',
    (state) => {
      expect(isTerminal(takeawayStateMachine, state)).toBe(false);
    },
  );
});

describe('takeaway customer-creation and role scope', () => {
  it('customer submissions are only ever created REQUESTED, never ACCEPTED', () => {
    expect(TAKEAWAY_CUSTOMER_CREATABLE_STATE).toBe('REQUESTED');
  });

  it('AUDITOR cannot perform transitions (read-only by design)', () => {
    expect(TAKEAWAY_STAFF_ROLES).not.toContain('AUDITOR');
  });

  it('ORDER_STAFF, MANAGER, and OWNER can', () => {
    expect(TAKEAWAY_STAFF_ROLES).toEqual(
      expect.arrayContaining(['ORDER_STAFF', 'MANAGER', 'OWNER']),
    );
  });
});
