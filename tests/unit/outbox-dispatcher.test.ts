import { describe, expect, it } from 'vitest';
import { buildOutboxEvent } from '../../src/lib/domain/outbox';
import { createInMemoryOutboxStore } from '../../src/lib/domain/outbox-store';
import { runDispatchCycle, type OutboxHandler } from '../../src/lib/domain/outbox-dispatcher';

const NOW = new Date('2026-08-27T12:00:00Z');
let idCounter = 0;
const generateId = () => `outbox-${++idCounter}`;

function harness() {
  const store = createInMemoryOutboxStore();
  return store;
}

async function seed(store: ReturnType<typeof harness>, destination = 'staff_notification') {
  await store.append(
    buildOutboxEvent({
      eventType: 'takeaway_request.requested',
      entityType: 'TAKEAWAY_REQUEST',
      entityId: 'req-1',
      payload: { totalPkr: 1000 },
      destination,
      generateId,
      now: () => NOW,
    }),
  );
}

describe('runDispatchCycle — happy path', () => {
  it('delivers a claimed event exactly once and marks it DELIVERED', async () => {
    const store = harness();
    await seed(store);
    let callCount = 0;
    const handler: OutboxHandler = async () => {
      callCount += 1;
    };

    const summary = await runDispatchCycle({
      store,
      handlers: { staff_notification: handler },
      now: () => NOW,
    });

    expect(summary).toEqual({ claimed: 1, delivered: 1, retried: 0, terminal: 0 });
    expect(callCount).toBe(1);
    expect((await store.list())[0]?.status).toBe('DELIVERED');
  });

  it('a row with no registered handler for its destination fails terminal immediately, never retried', async () => {
    const store = harness();
    await seed(store, 'unregistered_destination');

    const summary = await runDispatchCycle({ store, handlers: {}, now: () => NOW });

    expect(summary).toEqual({ claimed: 1, delivered: 0, retried: 0, terminal: 1 });
    const record = (await store.list())[0]!;
    expect(record.status).toBe('FAILED');
    expect(record.lastError).toContain('unregistered_destination');
  });
});

describe('runDispatchCycle — crash/retry with backoff', () => {
  it('a handler that throws once is retried with a future next_attempt_at, not marked terminal', async () => {
    const store = harness();
    await seed(store);
    let attempts = 0;
    const handler: OutboxHandler = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient failure');
    };

    const first = await runDispatchCycle({
      store,
      handlers: { staff_notification: handler },
      now: () => NOW,
      maxAttempts: 5,
    });
    expect(first).toEqual({ claimed: 1, delivered: 0, retried: 1, terminal: 0 });

    const record = (await store.list())[0]!;
    expect(record.status).toBe('PENDING');
    expect(record.attemptCount).toBe(1);
    expect(new Date(record.nextAttemptAt!).getTime()).toBeGreaterThan(NOW.getTime());

    // A second cycle right away must not re-claim it — it isn't due yet.
    const tooSoon = await runDispatchCycle({
      store,
      handlers: { staff_notification: handler },
      now: () => NOW,
      maxAttempts: 5,
    });
    expect(tooSoon.claimed).toBe(0);

    // Once due, the retry succeeds.
    const dueAt = new Date(record.nextAttemptAt!);
    const second = await runDispatchCycle({
      store,
      handlers: { staff_notification: handler },
      now: () => dueAt,
      maxAttempts: 5,
    });
    expect(second).toEqual({ claimed: 1, delivered: 1, retried: 0, terminal: 0 });
    expect(attempts).toBe(2);
  });

  it('backoff grows with each successive attempt (bounded exponential)', async () => {
    const store = harness();
    await seed(store);
    const handler: OutboxHandler = async () => {
      throw new Error('always fails');
    };

    let now = NOW;
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      await runDispatchCycle({
        store,
        handlers: { staff_notification: handler },
        now: () => now,
        maxAttempts: 10,
        baseBackoffMs: 1000,
        maxBackoffMs: 60 * 60 * 1000,
      });
      const record = (await store.list())[0]!;
      const delay = new Date(record.nextAttemptAt!).getTime() - now.getTime();
      delays.push(delay);
      now = new Date(record.nextAttemptAt!);
    }

    expect(delays[1]).toBeGreaterThan(delays[0]!);
    expect(delays[2]).toBeGreaterThan(delays[1]!);
  });
});

describe('runDispatchCycle — poison message', () => {
  it('a handler that always throws is marked terminal once maxAttempts is reached, and never retried again', async () => {
    const store = harness();
    await seed(store);
    let callCount = 0;
    const handler: OutboxHandler = async () => {
      callCount += 1;
      throw new Error('poison');
    };

    let now = NOW;
    const maxAttempts = 3;
    for (let i = 0; i < maxAttempts; i++) {
      await runDispatchCycle({
        store,
        handlers: { staff_notification: handler },
        now: () => now,
        maxAttempts,
        baseBackoffMs: 10,
        maxBackoffMs: 1000,
      });
      const record = (await store.list())[0]!;
      if (record.status !== 'PENDING') break;
      now = new Date(record.nextAttemptAt!);
    }

    const record = (await store.list())[0]!;
    expect(record.status).toBe('FAILED');
    expect(record.lastError).toBe('poison');
    expect(callCount).toBe(maxAttempts);

    // Long after "terminal," it must never be claimed or invoked again.
    const muchLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const laterCycle = await runDispatchCycle({
      store,
      handlers: { staff_notification: handler },
      now: () => muchLater,
      maxAttempts,
    });
    expect(laterCycle.claimed).toBe(0);
    expect(callCount).toBe(maxAttempts);
  });
});

describe('runDispatchCycle — worker overlap', () => {
  it('two genuinely concurrent dispatch cycles never both invoke the handler for the same event', async () => {
    const store = harness();
    await seed(store);
    let callCount = 0;
    const handler: OutboxHandler = async () => {
      callCount += 1;
    };

    const [a, b] = await Promise.all([
      runDispatchCycle({ store, handlers: { staff_notification: handler }, now: () => NOW }),
      runDispatchCycle({ store, handlers: { staff_notification: handler }, now: () => NOW }),
    ]);

    expect(a.claimed + b.claimed).toBe(1);
    expect(callCount).toBe(1);
    expect((await store.list())[0]?.status).toBe('DELIVERED');
  });
});
