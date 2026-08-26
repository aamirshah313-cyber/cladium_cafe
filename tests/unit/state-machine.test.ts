import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal, type StateMachine } from '../../src/lib/domain/state-machine';

type S = 'A' | 'B' | 'C';

const machine: StateMachine<S> = {
  transitions: {
    A: ['B'],
    B: ['C'],
    C: [],
  },
};

describe('canTransition', () => {
  it('allows a listed transition', () => {
    expect(canTransition(machine, 'A', 'B')).toBe(true);
  });

  it('rejects an unlisted transition', () => {
    expect(canTransition(machine, 'A', 'C')).toBe(false);
  });

  it('rejects transitioning to the same state', () => {
    expect(canTransition(machine, 'A', 'A')).toBe(false);
  });

  it('rejects transitioning out of a terminal state', () => {
    expect(canTransition(machine, 'C', 'A')).toBe(false);
  });
});

describe('isTerminal', () => {
  it('is false for a state with outgoing transitions', () => {
    expect(isTerminal(machine, 'A')).toBe(false);
  });

  it('is true for a state with none', () => {
    expect(isTerminal(machine, 'C')).toBe(true);
  });
});
