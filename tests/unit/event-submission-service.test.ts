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

const DRAFT = {
  guestName: 'Aamir',
  guestPhone: '+923001234567',
  occasion: 'Birthday',
  requestedDate: '2026-08-27',
  requestedTime: '19:30',
  guestCount: 20,
  decorInterest: true,
  notes: null,
};

async function prepareAndSubmit(
  deps: EventServiceDeps,
  idempotencyKey = 'idem-key-0123456789',
  sessionId = 'session-1',
) {
  const prepared = await prepareEventRequest(deps, { sessionId, ...DRAFT });
  if (!prepared.ok) throw new Error('prepare failed in test setup');
  return submitEventRequest(deps, {
    sessionId,
    ...DRAFT,
    sourceChannel: 'WEB',
    confirmationToken: prepared.value.confirmationToken,
    idempotencyKey,
    correlationId: 'corr-1',
  });
}

describe('prepareEventRequest', () => {
  it('echoes the submitted fields and issues a confirmation token', async () => {
    const deps = harness();
    const result = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.review).toMatchObject(DRAFT);
      expect(typeof result.value.confirmationToken).toBe('string');
    }
  });
});

describe('submitEventRequest — happy path', () => {
  it('creates the request in REQUESTED with no quote', async () => {
    const deps = harness();
    const result = await prepareAndSubmit(deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toBe('REQUESTED');

    const record = await deps.requestStore.find(result.value.requestId);
    expect(record).toMatchObject({
      state: 'REQUESTED',
      version: 1,
      quotedAmountPkr: null,
      ...DRAFT,
    });
  });

  it('appends a REQUESTED status event with no previous state', async () => {
    const deps = harness();
    await prepareAndSubmit(deps);
    const events = (deps.statusEvents as unknown as { events: unknown[] }).events;
    expect(events).toEqual([
      expect.objectContaining({
        entityType: 'EVENT_REQUEST',
        previousState: null,
        newState: 'REQUESTED',
        actorType: 'GUEST',
      }),
    ]);
  });

  it('appends an audit event and an outbox staff notification', async () => {
    const deps = harness();
    await prepareAndSubmit(deps);
    expect((deps.auditEvents as unknown as { events: unknown[] }).events).toHaveLength(1);
    const outboxEvents = (deps.outbox as unknown as { events: { eventType: string }[] }).events;
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.eventType).toBe('event_request.requested');
  });

  it('marks the confirmation token used — it cannot be submitted twice', async () => {
    const deps = harness();
    const prepared = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const first = await submitEventRequest(deps, {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-aaaaaaaaaa',
      correlationId: 'corr-1',
    });
    expect(first.ok).toBe(true);

    const second = await submitEventRequest(deps, {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-bbbbbbbbbb',
      correlationId: 'corr-2',
    });
    expect(second.ok).toBe(false);
  });
});

describe('submitEventRequest — idempotent replay', () => {
  it('a repeated call with the same idempotency key returns the original result without creating a second request', async () => {
    const deps = harness();
    const prepared = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const input = {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-cccccccccc',
      correlationId: 'corr-1',
    };

    const first = await submitEventRequest(deps, input);
    const second = await submitEventRequest(deps, input);

    expect(first).toEqual(second);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
  });
});

describe('submitEventRequest — Step 23 concurrency and double-click', () => {
  it('two genuinely concurrent submits with the same idempotency key create exactly one request', async () => {
    const deps = harness();
    const prepared = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const input = {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-concurrent01',
      correlationId: 'corr-1',
    };

    const [a, b] = await Promise.all([
      submitEventRequest(deps, input),
      submitEventRequest(deps, input),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'IDEMPOTENCY_CONFLICT')).toHaveLength(1);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
  });

  it('a double-click that races two different idempotency keys against the same token still creates exactly one request', async () => {
    const deps = harness();
    const prepared = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const baseInput = {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      correlationId: 'corr-1',
    };

    const [a, b] = await Promise.all([
      submitEventRequest(deps, { ...baseInput, idempotencyKey: 'idem-key-race-a0000' }),
      submitEventRequest(deps, { ...baseInput, idempotencyKey: 'idem-key-race-b0000' }),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
  });
});

describe('submitEventRequest — bad token', () => {
  it('fails for a token issued to a different session', async () => {
    const deps = harness();
    const prepared = await prepareEventRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const result = await submitEventRequest(deps, {
      sessionId: 'session-2',
      ...DRAFT,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-eeeeeeeeee',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});
