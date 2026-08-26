import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../src/lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../src/lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import { emptyCart, addItemToCart, type Cart } from '../../src/modules/takeaway/cart';
import type { PublishedMenuView } from '../../src/modules/menu/menu-view';
import {
  prepareTakeawayRequest,
  submitTakeawayRequest,
  type TakeawayServiceDeps,
} from '../../src/modules/takeaway/submission-service';
import type {
  TakeawayItemSnapshot,
  TakeawayRequestRecord,
} from '../../src/modules/takeaway/request';

const NOW = () => new Date('2026-08-26T12:00:00Z');

const MENU: PublishedMenuView = {
  status: 'PUBLISHED',
  versionNumber: 1,
  categories: [
    {
      id: 'steaks',
      name: 'Steaks',
      items: [
        {
          id: 'steaks.ribeye',
          name: 'Ribeye Steak',
          groupLabel: null,
          availability: 'AVAILABLE',
          basePricePkr: 3500,
          variants: [],
          isSignature: true,
          serves: '1',
          servedWith: null,
        },
      ],
    },
  ],
};

function harness(menu: PublishedMenuView = MENU) {
  let idCounter = 0;
  const deps: TakeawayServiceDeps = {
    getMenuView: () => menu,
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore(),
    requestStore: createInMemoryVersionedStore<TakeawayRequestRecord>(),
    itemSnapshots: createInMemorySink<TakeawayItemSnapshot>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
    generateId: () => `id-${++idCounter}`,
    now: NOW,
  };
  return deps;
}

function cartWithRibeye(): Cart {
  const result = addItemToCart(emptyCart('cart-1', 'session-1', 1), MENU, {
    menuItemId: 'steaks.ribeye',
    quantity: 2,
  });
  if (!result.ok) throw new Error('fixture setup failed');
  return result.value;
}

const GUEST_DETAILS = { guestName: 'Aamir', guestPhone: '+923001234567' };

describe('prepareTakeawayRequest', () => {
  it('builds a review with server-computed totals and issues a token', async () => {
    const deps = harness();
    const result = await prepareTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart: cartWithRibeye(),
      ...GUEST_DETAILS,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.review.totals.subtotalPkr).toBe(7000);
      expect(typeof result.value.confirmationToken).toBe('string');
    }
  });

  it('fails when the menu is not published', async () => {
    const deps = harness({ status: 'UNPUBLISHED' });
    const result = await prepareTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart: cartWithRibeye(),
      ...GUEST_DETAILS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FEATURE_DISABLED');
  });
});

async function prepareAndSubmit(
  deps: TakeawayServiceDeps,
  cart: Cart,
  idempotencyKey = 'idem-key-0123456789',
) {
  const prepared = await prepareTakeawayRequest(deps, {
    sessionId: 'session-1',
    cart,
    ...GUEST_DETAILS,
  });
  if (!prepared.ok) throw new Error('prepare failed in test setup');
  return submitTakeawayRequest(deps, {
    sessionId: 'session-1',
    cart,
    ...GUEST_DETAILS,
    sourceChannel: 'WEB',
    confirmationToken: prepared.value.confirmationToken,
    idempotencyKey,
    correlationId: 'corr-1',
  });
}

describe('submitTakeawayRequest — happy path', () => {
  it('creates the request in REQUESTED with immutable snapshot lines matching server totals', async () => {
    const deps = harness();
    const cart = cartWithRibeye();
    const result = await prepareAndSubmit(deps, cart);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toBe('REQUESTED');

    const record = await deps.requestStore.find(result.value.requestId);
    expect(record).toMatchObject({
      state: 'REQUESTED',
      version: 1,
      totalPkr: 7000,
      subtotalPkr: 7000,
    });

    const snapshot = (deps.itemSnapshots as unknown as { events: TakeawayItemSnapshot[] }).events;
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      menuItemId: 'steaks.ribeye',
      quantity: 2,
      unitPricePkr: 3500,
      lineTotalPkr: 7000,
    });
  });

  it('appends a REQUESTED status event with no previous state', async () => {
    const deps = harness();
    await prepareAndSubmit(deps, cartWithRibeye());
    const events = (deps.statusEvents as unknown as { events: unknown[] }).events;
    expect(events).toEqual([
      expect.objectContaining({
        entityType: 'TAKEAWAY_REQUEST',
        previousState: null,
        newState: 'REQUESTED',
        actorType: 'GUEST',
      }),
    ]);
  });

  it('appends an audit event and an outbox staff notification', async () => {
    const deps = harness();
    await prepareAndSubmit(deps, cartWithRibeye());
    expect((deps.auditEvents as unknown as { events: unknown[] }).events).toHaveLength(1);
    const outboxEvents = (deps.outbox as unknown as { events: { eventType: string }[] }).events;
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.eventType).toBe('takeaway_request.requested');
  });

  it('marks the confirmation token used — it cannot be submitted twice', async () => {
    const deps = harness();
    const cart = cartWithRibeye();
    const prepared = await prepareTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
    });
    if (!prepared.ok) throw new Error('prepare failed');

    const first = await submitTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-aaaaaaaaaa',
      correlationId: 'corr-1',
    });
    expect(first.ok).toBe(true);

    // Reusing the SAME token under a different idempotency key must still
    // fail — single-use is about the token, not the idempotency key.
    const second = await submitTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-bbbbbbbbbb',
      correlationId: 'corr-2',
    });
    expect(second.ok).toBe(false);
  });
});

describe('submitTakeawayRequest — idempotent replay', () => {
  it('a repeated call with the same idempotency key returns the original result without creating a second request', async () => {
    const deps = harness();
    const cart = cartWithRibeye();
    const prepared = await prepareTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
    });
    if (!prepared.ok) throw new Error('prepare failed');

    const input = {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-cccccccccc',
      correlationId: 'corr-1',
    };

    const first = await submitTakeawayRequest(deps, input);
    const second = await submitTakeawayRequest(deps, input);

    expect(first).toEqual(second);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
  });
});

describe('submitTakeawayRequest — Step 21 concurrency and double-click', () => {
  it('two genuinely concurrent submits with the same idempotency key create exactly one request', async () => {
    const deps = harness();
    const cart = cartWithRibeye();
    const prepared = await prepareTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
    });
    if (!prepared.ok) throw new Error('prepare failed');

    const input = {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-concurrent01',
      correlationId: 'corr-1',
    };

    // Promise.all, not two sequential awaits — a double-click fires both
    // requests before either has a response, which is what this actually
    // exercises (a sequential test can't reach the race at all). Unlike a
    // *sequential* replay (the "idempotent replay" describe block above,
    // where the first call has already recorded SUCCEEDED before the
    // second ever starts), a true concurrent duplicate arrives while the
    // first is still IN_PROGRESS — so the correct outcome is one winner and
    // one IDEMPOTENCY_CONFLICT, not two identical successes. The point
    // isn't that the loser looks nice; it's that the system never creates
    // a second request.
    const [a, b] = await Promise.all([
      submitTakeawayRequest(deps, input),
      submitTakeawayRequest(deps, input),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'IDEMPOTENCY_CONFLICT')).toHaveLength(1);
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
    const snapshot = (deps.itemSnapshots as unknown as { events: unknown[] }).events;
    expect(snapshot).toHaveLength(1); // not duplicated
  });

  it('a double-click that races two different idempotency keys against the same token still creates exactly one request', async () => {
    const deps = harness();
    const cart = cartWithRibeye();
    const prepared = await prepareTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
    });
    if (!prepared.ok) throw new Error('prepare failed');

    const baseInput = {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      correlationId: 'corr-1',
    };

    const [a, b] = await Promise.all([
      submitTakeawayRequest(deps, { ...baseInput, idempotencyKey: 'idem-key-race-a0000' }),
      submitTakeawayRequest(deps, { ...baseInput, idempotencyKey: 'idem-key-race-b0000' }),
    ]);

    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1); // exactly one winner
    expect(results.filter((r) => !r.ok)).toHaveLength(1); // the other loses on the now-used token
    const requestStore = deps.requestStore as unknown as { records: Map<string, unknown> };
    expect(requestStore.records.size).toBe(1);
  });
});

describe('submitTakeawayRequest — stale review', () => {
  it('fails STALE_REVIEW when the menu price changed since the review was issued', async () => {
    const deps = harness();
    const cart = cartWithRibeye();
    const prepared = await prepareTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
    });
    if (!prepared.ok) throw new Error('prepare failed');

    // Menu price changes between review and submission.
    const depsWithChangedPrice: TakeawayServiceDeps = {
      ...deps,
      getMenuView: () => ({
        ...MENU,
        categories: MENU.categories.map((c) => ({
          ...c,
          items: c.items.map((i) => (i.id === 'steaks.ribeye' ? { ...i, basePricePkr: 4000 } : i)),
        })),
      }),
    };

    const result = await submitTakeawayRequest(depsWithChangedPrice, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-dddddddddd',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STALE_REVIEW');
  });
});

describe('submitTakeawayRequest — bad token', () => {
  it('fails for a token issued to a different session', async () => {
    const deps = harness();
    const cart = cartWithRibeye();
    const prepared = await prepareTakeawayRequest(deps, {
      sessionId: 'session-1',
      cart,
      ...GUEST_DETAILS,
    });
    if (!prepared.ok) throw new Error('prepare failed');

    const result = await submitTakeawayRequest(deps, {
      sessionId: 'session-2',
      cart,
      ...GUEST_DETAILS,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-eeeeeeeeee',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});
