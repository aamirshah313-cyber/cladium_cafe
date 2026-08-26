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

const DRAFT = {
  guestName: 'Aamir',
  guestPhone: '+923001234567',
  requestedDate: '2026-09-01',
  requestedTime: '19:00',
  partySize: 4,
  seatingPreference: 'TREEHOUSE' as const,
};

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

async function prepareAndSubmit(deps: BookingServiceDeps, idempotencyKey = 'idem-key-0123456789') {
  const prepared = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
  if (!prepared.ok) throw new Error('prepare failed');
  return submitBookingRequest(deps, {
    sessionId: 'session-1',
    ...DRAFT,
    sourceChannel: 'WEB',
    confirmationToken: prepared.value.confirmationToken,
    idempotencyKey,
    correlationId: 'corr-1',
  });
}

describe('booking submission — happy path', () => {
  it('creates the request in REQUESTED, treehouse a preference not a guarantee', async () => {
    const deps = harness();
    const result = await prepareAndSubmit(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = await deps.requestStore.find(result.value.requestId);
    expect(record).toMatchObject({
      state: 'REQUESTED',
      version: 1,
      seatingPreference: 'TREEHOUSE',
      partySize: 4,
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

describe('booking submission — idempotent replay and stale review', () => {
  it('replays the same result for a repeated idempotency key', async () => {
    const deps = harness();
    const prepared = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');
    const input = {
      sessionId: 'session-1',
      ...DRAFT,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-repeat00000',
      correlationId: 'corr-1',
    };

    const first = await submitBookingRequest(deps, input);
    const second = await submitBookingRequest(deps, input);
    expect(first).toEqual(second);
  });

  it('fails STALE_REVIEW when the reviewed details changed before submission', async () => {
    const deps = harness();
    const prepared = await prepareBookingRequest(deps, { sessionId: 'session-1', ...DRAFT });
    if (!prepared.ok) throw new Error('prepare failed');

    const result = await submitBookingRequest(deps, {
      sessionId: 'session-1',
      ...DRAFT,
      partySize: 6, // changed after review
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-changed00000',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STALE_REVIEW');
  });
});
