import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import {
  assignTakeawayRequest,
  getTakeawayRequestDetail,
  listTakeawayRequests,
  transitionTakeawayRequest,
  type TakeawayStaffDeps,
} from '../../src/modules/takeaway/staff-service';
import type {
  TakeawayItemSnapshot,
  TakeawayRequestRecord,
} from '../../src/modules/takeaway/request';
import type { Actor } from '../../src/lib/domain/actor';

const NOW = () => new Date('2026-08-27T12:00:00Z');
const OWNER: Actor = { type: 'STAFF', id: 'staff-1', roles: ['OWNER'] };
const ORDER_STAFF: Actor = { type: 'STAFF', id: 'staff-2', roles: ['ORDER_STAFF'] };
const AUDITOR: Actor = { type: 'STAFF', id: 'staff-3', roles: ['AUDITOR'] };
const GUEST: Actor = { type: 'GUEST', id: 'session-1' };

function harness(): TakeawayStaffDeps {
  return {
    requestStore: createInMemoryVersionedStore<TakeawayRequestRecord>(),
    itemSnapshots: createInMemorySink<TakeawayItemSnapshot>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
  };
}

function record(overrides: Partial<TakeawayRequestRecord> = {}): TakeawayRequestRecord {
  return {
    id: 'order-1',
    version: 1,
    state: 'REQUESTED',
    guestName: 'Aamir Shah',
    guestPhone: '+923001234567',
    menuVersionNumber: 1,
    subtotalPkr: 3500,
    adjustmentsPkr: 0,
    totalPkr: 3500,
    requestedCollectionNote: null,
    notes: null,
    sessionId: 'session-1',
    sourceChannel: 'WEB',
    assignedStaffId: null,
    createdAt: NOW().toISOString(),
    ...overrides,
  };
}

describe('listTakeawayRequests', () => {
  it('returns matching requests for a viewer role, including AUDITOR', async () => {
    const deps = harness();
    await deps.requestStore.create(record());
    await deps.requestStore.create(record({ id: 'order-2', guestName: 'Bilal' }));

    const asOwner = await listTakeawayRequests(deps, OWNER);
    expect(asOwner.ok).toBe(true);
    if (asOwner.ok) expect(asOwner.value).toHaveLength(2);

    const asAuditor = await listTakeawayRequests(deps, AUDITOR);
    expect(asAuditor.ok).toBe(true);
    if (asAuditor.ok) expect(asAuditor.value).toHaveLength(2);
  });

  it('applies the state/search filter', async () => {
    const deps = harness();
    await deps.requestStore.create(record());
    await deps.requestStore.create(
      record({ id: 'order-2', guestName: 'Bilal', state: 'CANCELLED' }),
    );

    const result = await listTakeawayRequests(deps, OWNER, { state: 'REQUESTED' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((r) => r.id)).toEqual(['order-1']);
  });

  it('forbids a guest actor', async () => {
    const deps = harness();
    const result = await listTakeawayRequests(deps, GUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});

describe('getTakeawayRequestDetail', () => {
  it('returns the record, its item snapshots, and its status history', async () => {
    const deps = harness();
    await deps.requestStore.create(record());
    await deps.itemSnapshots.append({
      id: 'snap-1',
      takeawayRequestId: 'order-1',
      menuItemId: 'steaks.ribeye',
      name: 'Ribeye Steak',
      variantLabel: null,
      unitPricePkr: 3500,
      quantity: 1,
      lineTotalPkr: 3500,
    });
    await deps.itemSnapshots.append({
      id: 'snap-2',
      takeawayRequestId: 'order-2', // a different request — must not leak in
      menuItemId: 'x',
      name: 'x',
      variantLabel: null,
      unitPricePkr: 1,
      quantity: 1,
      lineTotalPkr: 1,
    });
    await deps.statusEvents.append({
      entityType: 'TAKEAWAY_REQUEST',
      entityId: 'order-1',
      previousState: null,
      newState: 'REQUESTED',
      actorType: 'GUEST',
      actorId: 'session-1',
      reasonCode: null,
      reasonNote: null,
      requestVersion: 1,
      correlationId: 'corr-1',
      occurredAt: NOW().toISOString(),
    });

    const result = await getTakeawayRequestDetail(deps, OWNER, 'order-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.id).toBe('order-1');
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.id).toBe('snap-1');
    expect(result.value.history).toHaveLength(1);
  });

  it('returns NOT_FOUND for an unknown id', async () => {
    const deps = harness();
    const result = await getTakeawayRequestDetail(deps, OWNER, 'missing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('forbids a non-viewer role', async () => {
    const deps = harness();
    await deps.requestStore.create(record());
    const result = await getTakeawayRequestDetail(deps, GUEST, 'order-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});

describe('transitionTakeawayRequest', () => {
  it('lets ORDER_STAFF accept a REQUESTED order', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionTakeawayRequest(deps, ORDER_STAFF, {
      entityId: 'order-1',
      expectedVersion: 1,
      newState: 'ACCEPTED',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.state).toBe('ACCEPTED');
  });

  it('forbids AUDITOR from transitioning — view-only', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionTakeawayRequest(deps, AUDITOR, {
      entityId: 'order-1',
      expectedVersion: 1,
      newState: 'ACCEPTED',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('requires a reason to reject an order', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionTakeawayRequest(deps, ORDER_STAFF, {
      entityId: 'order-1',
      expectedVersion: 1,
      newState: 'REJECTED',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues).toEqual([{ path: 'reasonCode', code: 'required' }]);
  });

  it('accepts a rejection once a reason is supplied', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await transitionTakeawayRequest(deps, ORDER_STAFF, {
      entityId: 'order-1',
      expectedVersion: 1,
      newState: 'REJECTED',
      reasonCode: 'out_of_stock',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(true);
  });

  it('two genuinely concurrent transitions resolve to exactly one winner (CONFLICT for the loser)', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const [a, b] = await Promise.all([
      transitionTakeawayRequest(deps, ORDER_STAFF, {
        entityId: 'order-1',
        expectedVersion: 1,
        newState: 'ACCEPTED',
        correlationId: 'corr-1',
      }),
      transitionTakeawayRequest(deps, ORDER_STAFF, {
        entityId: 'order-1',
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

describe('assignTakeawayRequest', () => {
  it('assigns and unassigns', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const assigned = await assignTakeawayRequest(deps, OWNER, {
      entityId: 'order-1',
      expectedVersion: 1,
      assignedStaffId: 'staff-2',
      correlationId: 'corr-1',
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(assigned.value.assignedStaffId).toBe('staff-2');

    const unassigned = await assignTakeawayRequest(deps, OWNER, {
      entityId: 'order-1',
      expectedVersion: assigned.value.version,
      assignedStaffId: null,
      correlationId: 'corr-2',
    });
    expect(unassigned.ok).toBe(true);
    if (unassigned.ok) expect(unassigned.value.assignedStaffId).toBeNull();
  });

  it('forbids a guest actor', async () => {
    const deps = harness();
    await deps.requestStore.create(record());

    const result = await assignTakeawayRequest(deps, GUEST, {
      entityId: 'order-1',
      expectedVersion: 1,
      assignedStaffId: 'staff-2',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});
