/**
 * Bounded, server-held conversation state — Runbook Step 27.
 *
 * "Browser history is untrusted and cannot authorize actions": the
 * concierge never accepts a client-supplied message history, only the
 * new message for this turn — everything before it comes from here,
 * keyed by the caller's own verified session ID, the same isolation
 * `modules/takeaway/cart-store.ts` already gives a guest's cart.
 *
 * Only the final user text and final assistant text of each turn are
 * persisted — never the ephemeral tool-call/tool-result scaffolding a
 * turn's internal loop produces (`orchestrator.ts` rebuilds that fresh
 * each turn from the persisted turns plus the new message). This bounds
 * memory naturally: a long tool-calling turn never grows stored history,
 * only `MAX_TURNS` real exchanges ever do. A conversation idle past
 * `MAX_IDLE_MS` is treated as gone rather than served stale — `get`
 * returns `null`, the same as a session with no history at all, so an
 * old, possibly-stale-context conversation is never silently resumed.
 */

export const MAX_TURNS = 20; // 10 user/assistant exchanges.
export const MAX_IDLE_MS = 30 * 60 * 1000; // 30 minutes.

export interface ConversationTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly occurredAt: string;
}

export interface ConversationState {
  readonly sessionId: string;
  readonly turns: readonly ConversationTurn[];
  readonly updatedAt: string;
}

export interface ConversationStore {
  /** `null` for no history, or history idle past `MAX_IDLE_MS` — both treated as a fresh start. */
  get(sessionId: string, now?: Date): Promise<ConversationState | null>;
  append(sessionId: string, turn: ConversationTurn, now?: Date): Promise<ConversationState>;
  clear(sessionId: string): Promise<void>;
}

export function createInMemoryConversationStore(): ConversationStore & {
  readonly records: ReadonlyMap<string, ConversationState>;
} {
  const records = new Map<string, ConversationState>();

  function isStale(state: ConversationState, now: Date): boolean {
    return now.getTime() - new Date(state.updatedAt).getTime() > MAX_IDLE_MS;
  }

  return {
    records,

    async get(sessionId, now = new Date()) {
      const existing = records.get(sessionId);
      if (!existing) return null;
      if (isStale(existing, now)) return null;
      return existing;
    },

    async append(sessionId, turn, now = new Date()) {
      const existing = records.get(sessionId);
      const priorTurns = existing && !isStale(existing, now) ? existing.turns : [];
      const turns = [...priorTurns, turn].slice(-MAX_TURNS);
      const updated: ConversationState = { sessionId, turns, updatedAt: now.toISOString() };
      records.set(sessionId, updated);
      return updated;
    },

    async clear(sessionId) {
      records.delete(sessionId);
    },
  };
}
