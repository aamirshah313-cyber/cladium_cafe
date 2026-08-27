import { describe, expect, it } from 'vitest';
import {
  createInMemoryConversationStore,
  MAX_IDLE_MS,
  MAX_TURNS,
} from '../../src/modules/concierge/conversation-store';

const NOW = new Date('2026-08-28T12:00:00Z');

describe('createInMemoryConversationStore — basic append/get', () => {
  it('returns null for a session with no history', async () => {
    const store = createInMemoryConversationStore();
    expect(await store.get('session-1', NOW)).toBeNull();
  });

  it('returns appended turns in order', async () => {
    const store = createInMemoryConversationStore();
    await store.append(
      'session-1',
      { role: 'user', content: 'Hi', occurredAt: NOW.toISOString() },
      NOW,
    );
    await store.append(
      'session-1',
      { role: 'assistant', content: 'Hello!', occurredAt: NOW.toISOString() },
      NOW,
    );

    const state = await store.get('session-1', NOW);
    expect(state?.turns.map((t) => t.content)).toEqual(['Hi', 'Hello!']);
  });
});

describe('createInMemoryConversationStore — cross-session isolation', () => {
  it("never leaks one session's history into another", async () => {
    const store = createInMemoryConversationStore();
    await store.append(
      'session-1',
      { role: 'user', content: 'secret A', occurredAt: NOW.toISOString() },
      NOW,
    );
    await store.append(
      'session-2',
      { role: 'user', content: 'secret B', occurredAt: NOW.toISOString() },
      NOW,
    );

    const stateA = await store.get('session-1', NOW);
    const stateB = await store.get('session-2', NOW);
    expect(stateA?.turns.map((t) => t.content)).toEqual(['secret A']);
    expect(stateB?.turns.map((t) => t.content)).toEqual(['secret B']);
  });
});

describe('createInMemoryConversationStore — bounded size', () => {
  it('trims to MAX_TURNS, keeping only the most recent', async () => {
    const store = createInMemoryConversationStore();
    for (let i = 0; i < MAX_TURNS + 10; i++) {
      await store.append(
        'session-1',
        {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `turn-${i}`,
          occurredAt: NOW.toISOString(),
        },
        NOW,
      );
    }

    const state = await store.get('session-1', NOW);
    expect(state?.turns).toHaveLength(MAX_TURNS);
    expect(state?.turns[0]?.content).toBe(`turn-${10}`); // oldest 10 were dropped
    expect(state?.turns[MAX_TURNS - 1]?.content).toBe(`turn-${MAX_TURNS + 9}`);
  });
});

describe('createInMemoryConversationStore — idle staleness', () => {
  it('treats history idle past MAX_IDLE_MS as gone, not silently resumed', async () => {
    const store = createInMemoryConversationStore();
    await store.append(
      'session-1',
      { role: 'user', content: 'old message', occurredAt: NOW.toISOString() },
      NOW,
    );

    const muchLater = new Date(NOW.getTime() + MAX_IDLE_MS + 1000);
    expect(await store.get('session-1', muchLater)).toBeNull();
  });

  it('a fresh append after staleness starts a brand new history, not appended to the stale one', async () => {
    const store = createInMemoryConversationStore();
    await store.append(
      'session-1',
      { role: 'user', content: 'old message', occurredAt: NOW.toISOString() },
      NOW,
    );

    const muchLater = new Date(NOW.getTime() + MAX_IDLE_MS + 1000);
    await store.append(
      'session-1',
      { role: 'user', content: 'new message', occurredAt: muchLater.toISOString() },
      muchLater,
    );

    const state = await store.get('session-1', muchLater);
    expect(state?.turns.map((t) => t.content)).toEqual(['new message']);
  });

  it('still-fresh history (within MAX_IDLE_MS) is served normally', async () => {
    const store = createInMemoryConversationStore();
    await store.append(
      'session-1',
      { role: 'user', content: 'still fresh', occurredAt: NOW.toISOString() },
      NOW,
    );

    const soonAfter = new Date(NOW.getTime() + MAX_IDLE_MS - 1000);
    expect((await store.get('session-1', soonAfter))?.turns).toHaveLength(1);
  });
});

describe('createInMemoryConversationStore — clear', () => {
  it("removes a session's history entirely", async () => {
    const store = createInMemoryConversationStore();
    await store.append(
      'session-1',
      { role: 'user', content: 'x', occurredAt: NOW.toISOString() },
      NOW,
    );
    await store.clear('session-1');
    expect(await store.get('session-1', NOW)).toBeNull();
  });
});
