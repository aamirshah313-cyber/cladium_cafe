import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../src/lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../src/lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import {
  prepareEventRequest,
  submitEventRequest,
  type EventServiceDeps,
} from '../../src/modules/events/submission-service';
import type { EventRequestRecord } from '../../src/modules/events/request';

const NOW = () => new Date('2026-08-26T12:00:00Z');

const DRAFT = {
  guestName: 'Aamir',
  guestPhone: '+923001234567',
  occasion: 'Birthday',
  requestedDate: '2026-09-10',
  requestedTime: '18:00',
  guestCount: 12,
  decorInterest: true,
};

function harness() {
  let idCounter = 0;
  const deps: EventServiceDeps = {
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore(),
    requestStore: createInMemoryVersionedStore<EventRequestRecord>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
    generateId: () => `id-${++idCounter}`,
    now: NOW,
  };
  return deps;
}

async function prepareAndSubmit(deps: EventServiceDeps, idempotencyKey = 'idem-key-0123456789') {
  const prepared = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
  if (!prepared.ok) throw new Error('prepare failed');
  return submitEventRequest(deps, {
    sessionId: 'session-1',
    ...DRAFT,
    sourceChannel: 'WEB',
    confirmationToken: prepared.value.confirmationToken,
    idempotencyKey,
    correlationId: 'corr-1',
  });
}

describe('event submission — happy path', () => {
  it('creates the request in REQUESTED with no invented quote', async () => {
    const deps = harness();
    const result = await prepareAndSubmit(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = await deps.requestStore.find(result.value.requestId);
    expect(record).toMatchObject({
      state: 'REQUESTED',
      version: 1,
      quotedAmountPkr: null,
      decorInterest: true,
    });
  });

  it('appends status, audit, and outbox records', async () => {
    const deps = harness();
    await prepareAndSubmit(deps);
    expect((deps.statusEvents as unknown as { events: unknown[] }).events).toHaveLength(1);
    expect((deps.auditEvents as unknown as { events: unknown[] }).events).toHaveLength(1);
    expect((deps.outbox as unknown as { events: unknown[] }).events).toHaveLength(1);
  });
});

describe('event submission — idempotent replay and stale review', () => {
  it('replays the same result for a repeated idempotency key', async () => {
    const deps = harness();
    const prepared = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');
    const input = {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-repeat00000',
      correlationId: 'corr-1',
    };

    const first = await submitEventRequest(deps, input);
    const second = await submitEventRequest(deps, input);
    expect(first).toEqual(second);
  });

  it('fails STALE_REVIEW when the reviewed details changed before submission', async () => {
    const deps = harness();
    const prepared = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const result = await submitEventRequest(deps, {
      sessionId: 'session-1',
      ...DRAFT,
      guestCount: 20, // changed after review
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-changed00000',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STALE_REVIEW');
  });
});
