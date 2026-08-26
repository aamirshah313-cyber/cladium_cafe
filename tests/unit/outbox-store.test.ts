import { describe, expect, it } from 'vitest';
import { buildOutboxEvent } from '../../src/lib/domain/outbox';
import { createInMemoryOutboxStore } from '../../src/lib/domain/outbox-store';

const NOW = new Date('2026-08-27T12:00:00Z');
let idCounter = 0;
const generateId = () => `outbox-${++idCounter}`;

function seedEvent(overrides: Partial<Parameters<typeof buildOutboxEvent>[0]> = {}) {
  return buildOutboxEvent({
    eventType: 'takeaway_request.requested',
    entityType: 'TAKEAWAY_REQUEST',
    entityId: 'req-1',
    payload: { totalPkr: 1000 },
    destination: 'staff_notification',
    generateId,
    now: () => NOW,
    ...overrides,
  });
}

describe('createInMemoryOutboxStore — claimBatch', () => {
  it('claims a PENDING row whose next_attempt_at is due', async () => {
    const store = createInMemoryOutboxStore();
    await store.append(seedEvent());

    const claimed = await store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 });

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe('CLAIMED');
    expect(claimed[0]?.version).toBe(2);
  });

  it('does not claim a PENDING row whose next_attempt_at is in the future', async () => {
    const store = createInMemoryOutboxStore();
    const future = new Date(NOW.getTime() + 60_000);
    const event = seedEvent();
    await store.append({ ...event, nextAttemptAt: future.toISOString() });

    const claimed = await store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 });
    expect(claimed).toHaveLength(0);
  });

  it('does not re-claim a row that is already CLAIMED and not yet stale', async () => {
    const store = createInMemoryOutboxStore();
    await store.append(seedEvent());
    await store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 });

    const secondAttempt = await store.claimBatch({
      limit: 10,
      now: new Date(NOW.getTime() + 1000),
      staleClaimMs: 60_000,
    });
    expect(secondAttempt).toHaveLength(0);
  });

  it('reclaims a CLAIMED row once staleClaimMs has passed (a crashed worker never resolved it)', async () => {
    const store = createInMemoryOutboxStore();
    await store.append(seedEvent());
    await store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 });

    const staleNow = new Date(NOW.getTime() + 61_000);
    const reclaimed = await store.claimBatch({ limit: 10, now: staleNow, staleClaimMs: 60_000 });
    expect(reclaimed).toHaveLength(1);
  });

  it('respects the limit and orders oldest-due first', async () => {
    const store = createInMemoryOutboxStore();
    await store.append(seedEvent({ entityId: 'req-1' }));
    await store.append(seedEvent({ entityId: 'req-2', now: () => new Date(NOW.getTime() - 5000) }));

    const claimed = await store.claimBatch({ limit: 1, now: NOW, staleClaimMs: 60_000 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.entityId).toBe('req-2'); // the older due time comes first
  });

  it('two genuinely concurrent claims never both get the same row (worker overlap)', async () => {
    const store = createInMemoryOutboxStore();
    await store.append(seedEvent());

    const [a, b] = await Promise.all([
      store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 }),
      store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 }),
    ]);

    const totalClaimed = a.length + b.length;
    expect(totalClaimed).toBe(1);
  });
});

describe('createInMemoryOutboxStore — resolving a claim', () => {
  it('markDelivered succeeds for the expected version and fails for a stale one', async () => {
    const store = createInMemoryOutboxStore();
    await store.append(seedEvent());
    const [claimed] = await store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 });

    const stale = await store.markDelivered(claimed!.id, claimed!.version - 1, NOW);
    expect(stale).toBe(false);

    const ok = await store.markDelivered(claimed!.id, claimed!.version, NOW);
    expect(ok).toBe(true);
    expect((await store.list())[0]?.status).toBe('DELIVERED');
  });

  it('markRetry sets status back to PENDING with an incremented attempt count and a future next_attempt_at', async () => {
    const store = createInMemoryOutboxStore();
    await store.append(seedEvent());
    const [claimed] = await store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 });

    const nextAttemptAt = new Date(NOW.getTime() + 5000);
    const ok = await store.markRetry(
      claimed!.id,
      claimed!.version,
      { nextAttemptAt, lastError: 'handler threw' },
      NOW,
    );
    expect(ok).toBe(true);

    const record = (await store.list())[0]!;
    expect(record.status).toBe('PENDING');
    expect(record.attemptCount).toBe(1);
    expect(record.nextAttemptAt).toBe(nextAttemptAt.toISOString());
    expect(record.lastError).toBe('handler threw');
  });

  it('markTerminal sets status to FAILED and stops the row being claimable again', async () => {
    const store = createInMemoryOutboxStore();
    await store.append(seedEvent());
    const [claimed] = await store.claimBatch({ limit: 10, now: NOW, staleClaimMs: 60_000 });

    await store.markTerminal(claimed!.id, claimed!.version, { lastError: 'poison message' }, NOW);

    const record = (await store.list())[0]!;
    expect(record.status).toBe('FAILED');
    expect(record.failedAt).toBe(NOW.toISOString());

    const laterClaim = await store.claimBatch({
      limit: 10,
      now: new Date(NOW.getTime() + 10 * 60_000),
      staleClaimMs: 60_000,
    });
    expect(laterClaim).toHaveLength(0);
  });
});
