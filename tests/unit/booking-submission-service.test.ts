import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../src/lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../src/lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import {
  prepareBookingRequest,
  submitBookingRequest,
  type BookingServiceDeps,
} from '../../src/modules/bookings/submission-service';
import type { BookingRequestRecord } from '../../src/modules/bookings/request';

const NOW = () => new Date('2026-08-26T12:00:00Z');

function harness() {
  let idCounter = 0;
  const deps: BookingServiceDeps = {
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore(),
    requestStore: createInMemoryVersionedStore<BookingRequestRecord>(),
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
  requestedDate: '2026-08-27',
  requestedTime: '19:30',
  partySize: 4,
  seatingPreference: 'TREEHOUSE' as const,
  notes: null,
};

async function prepareAndSubmit(
  deps: BookingServiceDeps,
  idempotencyKey = 'idem-key-0123456789',
  sessionId = 'session-1',
) {
  const prepared = await prepareBookingRequest(deps, { sessionId, ...DRAFT });
  if (!prepared.ok) throw new Error('prepare failed in test setup');
  return submitBookingRequest(deps, {
    sessionId,
    ...DRAFT,
    sourceChannel: 'WEB',
    confirmationToken: prepared.value.confirmationToken,
    idempotencyKey,
    correlationId: 'corr-1',
  });
}

describe('prepareBookingRequest', () => {
  it('echoes the submitted fields and issues a confirmation token', async () => {
    const deps = harness();
    const result = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.review).toMatchObject(DRAFT);
      expect(typeof result.value.confirmationToken).toBe('string');
    }
  });
});

describe('submitBookingRequest — happy path', () => {
  it('creates the request in REQUESTED', async () => {
    const deps = harness();
    const result = await prepareAndSubmit(deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toBe('REQUESTED');

    const record = await deps.requestStore.find(result.value.requestId);
    expect(record).toMatchObject({ state: 'REQUESTED', version: 1, ...DRAFT });
  });

  it('appends a REQUESTED status event with no previous state', async () => {
    const deps = harness();
    await prepareAndSubmit(deps);
    const events = (deps.statusEvents as unknown as { events: unknown[] }).events;
    expect(events).toEqual([
      expect.objectContaining({
        entityType: 'BOOKING_REQUEST',
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
    expect(outboxEvents[0]?.eventType).toBe('booking_request.requested');
  });

  it('marks the confirmation token used — it cannot be submitted twice', async () => {
    const deps = harness();
    const prepared = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const first = await submitBookingRequest(deps, {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-aaaaaaaaaa',
      correlationId: 'corr-1',
    });
    expect(first.ok).toBe(true);

    const second = await submitBookingRequest(deps, {
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

describe('submitBookingRequest — idempotent replay', () => {
  it('a repeated call with the same idempotency key returns the original result without creating a second request', async () => {
    const deps = harness();
    const prepared = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const input = {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-cccccccccc',
      correlationId: 'corr-1',
    };

    const first = await submitBookingRequest(deps, input);
    const second = await submitBookingRequest(deps, input);

    expect(first).toEqual(second);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
  });
});

describe('submitBookingRequest — Step 22 concurrency and double-click', () => {
  it('two genuinely concurrent submits with the same idempotency key create exactly one request', async () => {
    const deps = harness();
    const prepared = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
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
      submitBookingRequest(deps, input),
      submitBookingRequest(deps, input),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'IDEMPOTENCY_CONFLICT')).toHaveLength(1);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
  });

  it('a double-click that races two different idempotency keys against the same token still creates exactly one request', async () => {
    const deps = harness();
    const prepared = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const baseInput = {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      correlationId: 'corr-1',
    };

    const [a, b] = await Promise.all([
      submitBookingRequest(deps, { ...baseInput, idempotencyKey: 'idem-key-race-a0000' }),
      submitBookingRequest(deps, { ...baseInput, idempotencyKey: 'idem-key-race-b0000' }),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
  });
});

describe('submitBookingRequest — bad token', () => {
  it('fails for a token issued to a different session', async () => {
    const deps = harness();
    const prepared = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const result = await submitBookingRequest(deps, {
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
