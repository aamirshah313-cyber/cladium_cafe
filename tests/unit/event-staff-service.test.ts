import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import {
  assignEventRequest,
  listEventRequests,
  transitionEventRequest,
  type EventStaffDeps,
} from '../../src/modules/events/staff-service';
import type { EventRequestRecord } from '../../src/modules/events/request';
import type { Actor } from '../../src/lib/domain/actor';

const NOW = () => new Date('2026-08-27T12:00:00Z');
const BOOKING_STAFF: Actor = { type: 'STAFF', id: 'staff-1', roles: ['BOOKING_STAFF'] };
const AUDITOR: Actor = { type: 'STAFF', id: 'staff-2', roles: ['AUDITOR'] };
const GUEST: Actor = { type: 'GUEST', id: 'session-1' };

function harness(): EventStaffDeps {
  return {
    requestStore: createInMemoryVersionedStore<EventRequestRecord>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
  };
}

function record(overrides: Partial<EventRequestRecord> = {}): EventRequestRecord {
  return {
    id: 'event-1',
    version: 1,
    state: 'REQUESTED',
    guestName: 'Aamir Shah',
    guestPhone: '+923001234567',
    occasion: 'Birthday',
    requestedDate: '2026-08-28',
    requestedTime: '19:00',
    guestCount: 20,
    decorInterest: true,
    notes: null,
    quotedAmountPkr: null,
    sessionId: 'session-1',
    sourceChannel: 'WEB',
    assignedStaffId: null,
    createdAt: NOW().toISOString(),
    ...overrides,
  };
}

describe('listEventRequests', () => {
  it('lets AUDITOR view but not write', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const viewResult = await listEventRequests(deps, AUDITOR);
    expect(viewResult.ok).toBe(true);

    const writeResult = await transitionEventRequest(deps, AUDITOR, {
      entityId: 'event-1',
      expectedVersion: 1,
      newState: 'CANCELLED',
      reasonCode: 'test',
      correlationId: 'corr-1',
    });
    expect(writeResult.ok).toBe(false);
    if (!writeResult.ok) expect(writeResult.error.code).toBe('FORBIDDEN');
  });
});

describe('transitionEventRequest — quoting', () => {
  it('rejects QUOTED with no quotedAmountPkr', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionEventRequest(deps, BOOKING_STAFF, {
      entityId: 'event-1',
      expectedVersion: 1,
      newState: 'QUOTED',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.issues).toEqual([{ path: 'quotedAmountPkr', code: 'required' }]);
    }
    expect((await deps.requestStore.find('event-1'))?.version).toBe(1);
  });

  it('rejects a negative quotedAmountPkr', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionEventRequest(deps, BOOKING_STAFF, {
      entityId: 'event-1',
      expectedVersion: 1,
      newState: 'QUOTED',
      quotedAmountPkr: -100,
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
  });

  it('sets quotedAmountPkr atomically with the state change', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionEventRequest(deps, BOOKING_STAFF, {
      entityId: 'event-1',
      expectedVersion: 1,
      newState: 'QUOTED',
      quotedAmountPkr: 15000,
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe('QUOTED');
      expect(result.value.quotedAmountPkr).toBe(15000);
    }
  });

  it('does not require a quote for CONFIRMED (only QUOTED does)', async () => {
    const deps = harness();
    await deps.requestStore.create(record({ state: 'CUSTOMER_ACCEPTED' }));

    const result = await transitionEventRequest(deps, BOOKING_STAFF, {
      entityId: 'event-1',
      expectedVersion: 1,
      newState: 'CONFIRMED',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(true);
  });
});

describe('transitionEventRequest — mandatory cancellation reason', () => {
  it('requires a reason to cancel', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionEventRequest(deps, BOOKING_STAFF, {
      entityId: 'event-1',
      expectedVersion: 1,
      newState: 'CANCELLED',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues).toEqual([{ path: 'reasonCode', code: 'required' }]);
  });

  it('two genuinely concurrent transitions resolve to exactly one winner', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const [a, b] = await Promise.all([
      transitionEventRequest(deps, BOOKING_STAFF, {
        entityId: 'event-1',
        expectedVersion: 1,
        newState: 'QUOTED',
        quotedAmountPkr: 12000,
        correlationId: 'corr-1',
      }),
      transitionEventRequest(deps, BOOKING_STAFF, {
        entityId: 'event-1',
        expectedVersion: 1,
        newState: 'CANCELLED',
        reasonCode: 'duplicate',
        correlationId: 'corr-2',
      }),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'CONFLICT')).toHaveLength(1);
  });
});

describe('assignEventRequest', () => {
  it('forbids a guest actor', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await assignEventRequest(deps, GUEST, {
      entityId: 'event-1',
      expectedVersion: 1,
      assignedStaffId: 'staff-1',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});
