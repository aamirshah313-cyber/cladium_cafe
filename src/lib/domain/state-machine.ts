/**
 * Generic finite state machine shape — Runbook Step 19.
 *
 * Shared by `modules/takeaway/state-machine.ts`, `modules/bookings/state-machine.ts`,
 * and `modules/events/state-machine.ts`: each supplies its own `transitions`
 * table (exactly the diagrams in data-model-v2.md §5 / tool-contracts.md),
 * and gets the same two pure predicates. "Only listed transitions are
 * legal" (data-model-v2.md §5) is enforced entirely by this table lookup —
 * there is no other path to a state change.
 */

export interface StateMachine<S extends string> {
  readonly transitions: Readonly<Record<S, readonly S[]>>;
}

export function canTransition<S extends string>(machine: StateMachine<S>, from: S, to: S): boolean {
  return machine.transitions[from].includes(to);
}

export function isTerminal<S extends string>(machine: StateMachine<S>, state: S): boolean {
  return machine.transitions[state].length === 0;
}
