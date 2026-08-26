import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { performStaffTransition } from '../../src/lib/domain/staff-transition';
import {
  createInMemoryVersionedStore,
  type VersionedRecord,
} from '../../src/lib/domain/versioned-store';
import {
  TAKEAWAY_STAFF_ROLES,
  takeawayStateMachine,
  type TakeawayState,
} from '../../src/modules/takeaway/state-machine';
import type { Actor } from '../../src/lib/domain/actor';
import type { AuditEvent } from '../../src/lib/domain/audit-event';
import type { OutboxEvent } from '../../src/lib/domain/outbox';
import type { StatusEvent } from '../../src/lib/domain/status-event';

interface TakeawayRecord extends VersionedRecord {
  readonly state: TakeawayState;
  readonly guestName: string;
}

const NOW = () => new Date('2026-08-26T12:00:00Z');
const ORDER_STAFF: Actor = { type: 'STAFF', id: 'staff-1', roles: ['ORDER_STAFF'] };
const AUDITOR: Actor = { type: 'STAFF', id: 'staff-2', roles: ['AUDITOR'] };
const GUEST: Actor = { type: 'GUEST', id: 'session-1' };

function harness() {
  const store = createInMemoryVersionedStore<TakeawayRecord>();
  const statusEvents = createInMemorySink<StatusEvent>();
  const auditEvents = createInMemorySink<AuditEvent>();
  const outbox = createInMemorySink<OutboxEvent>();
  return { store, statusEvents, auditEvents, outbox };
}

async function seedRequested(store: ReturnType<typeof harness>['store']) {
  await store.create({ id: 'order-1', version: 1, state: 'REQUESTED', guestName: 'Aamir' });
}

function baseInput(
  h: ReturnType<typeof harness>,
  overrides: Partial<
    Parameters<typeof performStaffTransition<TakeawayRecord, TakeawayState>>[0]
  > = {},
) {
  return {
    entityType: 'TAKEAWAY_REQUEST' as const,
    store: h.store,
    stateMachine: takeawayStateMachine,
    allowedRoles: TAKEAWAY_STAFF_ROLES,
    actor: ORDER_STAFF,
    entityId: 'order-1',
    expectedVersion: 1,
    newState: 'ACCEPTED' as TakeawayState,
    correlationId: 'corr-1',
    statusEvents: h.statusEvents,
    auditEvents: h.auditEvents,
    outbox: h.outbox,
    now: NOW,
    ...overrides,
  };
}

describe('performStaffTransition — happy path', () => {
  it('updates state, increments version, and appends status + audit events', async () => {
    const h = harness();
    await seedRequested(h.store);

    const result = await performStaffTransition(baseInput(h));

    expect(result).toEqual({
      ok: true,
      value: { id: 'order-1', version: 2, state: 'ACCEPTED', guestName: 'Aamir' },
    });
    expect(h.statusEvents.events).toEqual([
      expect.objectContaining({
        entityType: 'TAKEAWAY_REQUEST',
        entityId: 'order-1',
        previousState: 'REQUESTED',
        newState: 'ACCEPTED',
        actorType: 'STAFF',
        actorId: 'staff-1',
        requestVersion: 2,
        correlationId: 'corr-1',
      }),
    ]);
    expect(h.auditEvents.events).toHaveLength(1);
  });

  it('enqueues an outbox notification when a builder is supplied', async () => {
    const h = harness();
    await seedRequested(h.store);

    await performStaffTransition(
      baseInput(h, {
        buildOutboxNotification: (record) => ({
          eventType: 'takeaway.accepted',
          entityType: 'TAKEAWAY_REQUEST',
          entityId: record.id,
          payload: { state: record.state },
          destination: 'staff_notification',
        }),
      }),
    );

    expect(h.outbox.events).toHaveLength(1);
    expect(h.outbox.events[0]?.eventType).toBe('takeaway.accepted');
  });

  it('skips the outbox when the notification builder returns null', async () => {
    const h = harness();
    await seedRequested(h.store);

    await performStaffTransition(baseInput(h, { buildOutboxNotification: () => null }));

    expect(h.outbox.events).toHaveLength(0);
  });

  it('omits an outbox event entirely when no builder is supplied', async () => {
    const h = harness();
    await seedRequested(h.store);

    await performStaffTransition(baseInput(h));

    expect(h.outbox.events).toHaveLength(0);
  });
});

describe('performStaffTransition — authorization', () => {
  it('forbids an actor without an allowed role', async () => {
    const h = harness();
    await seedRequested(h.store);

    const result = await performStaffTransition(baseInput(h, { actor: AUDITOR }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
    expect(h.statusEvents.events).toHaveLength(0);
  });

  it('forbids a guest actor outright — this orchestrator is staff-only', async () => {
    const h = harness();
    await seedRequested(h.store);

    const result = await performStaffTransition(baseInput(h, { actor: GUEST }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});

describe('performStaffTransition — not found and version lock', () => {
  it('returns NOT_FOUND for an unknown entity', async () => {
    const h = harness();
    const result = await performStaffTransition(baseInput(h, { entityId: 'missing' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('returns CONFLICT when the expected version is stale', async () => {
    const h = harness();
    await seedRequested(h.store);

    const result = await performStaffTransition(baseInput(h, { expectedVersion: 99 }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
    expect(h.statusEvents.events).toHaveLength(0);
  });

  it('the loser of a race against a concurrent transition gets CONFLICT, not a silent overwrite', async () => {
    const h = harness();
    await seedRequested(h.store);

    const first = await performStaffTransition(baseInput(h));
    expect(first.ok).toBe(true);

    // Second caller still holds the pre-transition version (1).
    const second = await performStaffTransition(baseInput(h, { newState: 'REJECTED' }));

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('CONFLICT');
    expect((await h.store.find('order-1'))?.state).toBe('ACCEPTED');
  });
});

describe('performStaffTransition — illegal transitions', () => {
  it('rejects a transition not in the state machine table', async () => {
    const h = harness();
    await seedRequested(h.store);

    const result = await performStaffTransition(baseInput(h, { newState: 'COLLECTED' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.issues).toEqual([{ path: 'state', code: 'illegal_transition' }]);
    }
    expect(h.statusEvents.events).toHaveLength(0);
    expect(h.auditEvents.events).toHaveLength(0);
  });

  it('rejects transitioning out of a terminal state', async () => {
    const h = harness();
    await h.store.create({ id: 'order-1', version: 1, state: 'COLLECTED', guestName: 'Aamir' });

    const result = await performStaffTransition(baseInput(h, { newState: 'REQUESTED' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED');
  });
});
