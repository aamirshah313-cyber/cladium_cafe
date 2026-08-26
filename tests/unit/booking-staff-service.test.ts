import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import {
  assignBookingRequest,
  listBookingRequests,
  transitionBookingRequest,
  type BookingStaffDeps,
} from '../../src/modules/bookings/staff-service';
import type { BookingRequestRecord } from '../../src/modules/bookings/request';
import type { Actor } from '../../src/lib/domain/actor';

const NOW = () => new Date('2026-08-27T12:00:00Z');
const BOOKING_STAFF: Actor = { type: 'STAFF', id: 'staff-1', roles: ['BOOKING_STAFF'] };
const AUDITOR: Actor = { type: 'STAFF', id: 'staff-2', roles: ['AUDITOR'] };
const GUEST: Actor = { type: 'GUEST', id: 'session-1' };

function harness(): BookingStaffDeps {
  return {
    requestStore: createInMemoryVersionedStore<BookingRequestRecord>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
  };
}

function record(overrides: Partial<BookingRequestRecord> = {}): BookingRequestRecord {
  return {
    id: 'booking-1',
    version: 1,
    state: 'REQUESTED',
    guestName: 'Aamir Shah',
    guestPhone: '+923001234567',
    requestedDate: '2026-08-28',
    requestedTime: '19:00',
    partySize: 4,
    seatingPreference: 'GENERAL',
    notes: null,
    sessionId: 'session-1',
    sourceChannel: 'WEB',
    assignedStaffId: null,
    createdAt: NOW().toISOString(),
    ...overrides,
  };
}

describe('listBookingRequests', () => {
  it('lets AUDITOR view but not write', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const viewResult = await listBookingRequests(deps, AUDITOR);
    expect(viewResult.ok).toBe(true);
    if (viewResult.ok) expect(viewResult.value).toHaveLength(1);

    const writeResult = await transitionBookingRequest(deps, AUDITOR, {
      entityId: 'booking-1',
      expectedVersion: 1,
      newState: 'CONFIRMED',
      correlationId: 'corr-1',
    });
    expect(writeResult.ok).toBe(false);
    if (!writeResult.ok) expect(writeResult.error.code).toBe('FORBIDDEN');
  });
});

describe('transitionBookingRequest', () => {
  it('confirms a requested booking', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionBookingRequest(deps, BOOKING_STAFF, {
      entityId: 'booking-1',
      expectedVersion: 1,
      newState: 'CONFIRMED',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.state).toBe('CONFIRMED');
  });

  it('requires a reason to decline', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionBookingRequest(deps, BOOKING_STAFF, {
      entityId: 'booking-1',
      expectedVersion: 1,
      newState: 'DECLINED',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues).toEqual([{ path: 'reasonCode', code: 'required' }]);
  });

  it('requires a reason to mark a no-show', async () => {
    const deps = harness();
    await deps.requestStore.create(record({ state: 'CONFIRMED' }));

    const result = await transitionBookingRequest(deps, BOOKING_STAFF, {
      entityId: 'booking-1',
      expectedVersion: 1,
      newState: 'NO_SHOW',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED');
  });

  it('two genuinely concurrent transitions resolve to exactly one winner', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const [a, b] = await Promise.all([
      transitionBookingRequest(deps, BOOKING_STAFF, {
        entityId: 'booking-1',
        expectedVersion: 1,
        newState: 'CONFIRMED',
        correlationId: 'corr-1',
      }),
      transitionBookingRequest(deps, BOOKING_STAFF, {
        entityId: 'booking-1',
        expectedVersion: 1,
        newState: 'DECLINED',
        reasonCode: 'no_availability',
        correlationId: 'corr-2',
      }),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'CONFLICT')).toHaveLength(1);
  });
});

describe('assignBookingRequest', () => {
  it('forbids a guest actor', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await assignBookingRequest(deps, GUEST, {
      entityId: 'booking-1',
      expectedVersion: 1,
      assignedStaffId: 'staff-1',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('assigns successfully for an allowed role', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await assignBookingRequest(deps, BOOKING_STAFF, {
      entityId: 'booking-1',
      expectedVersion: 1,
      assignedStaffId: 'staff-1',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.assignedStaffId).toBe('staff-1');
  });
});
