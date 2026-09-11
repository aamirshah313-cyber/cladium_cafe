import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../src/lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../src/lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import { createInMemoryCartStore } from '../../src/modules/takeaway/cart-store';
import {
  addItem,
  getCart,
  modifyItem,
  removeItem,
  reviewTakeaway,
  submitTakeaway,
  type TakeawayHttpDeps,
} from '../../src/modules/takeaway/http';
import { prepareTakeawayRequest } from '../../src/modules/takeaway/submission-service';
import type { PublishedMenuView } from '../../src/modules/menu/menu-view';
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
      mediaKey: 'steaks',
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
  const deps: TakeawayHttpDeps = {
    getMenuView: async () => menu,
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore(),
    requestStore: createInMemoryVersionedStore<TakeawayRequestRecord>(),
    itemSnapshots: createInMemorySink<TakeawayItemSnapshot>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
    cartStore: createInMemoryCartStore(),
    generateId: () => `id-${++idCounter}`,
    now: NOW,
  };
  return deps;
}

const GUEST_DETAILS = { guestName: 'Aamir', guestPhone: '+923001234567' };

describe('getCart', () => {
  it('returns an empty cart with zero totals for a session with no cart yet', async () => {
    const deps = harness();
    const result = await getCart(deps, 'session-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cart.lines).toEqual([]);
      expect(result.value.totals.subtotalPkr).toBe(0);
    }
  });

  it('fails FEATURE_DISABLED when the menu is not published', async () => {
    const deps = harness({ status: 'UNPUBLISHED' });
    const result = await getCart(deps, 'session-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FEATURE_DISABLED');
  });
});

describe('addItem / modifyItem / removeItem', () => {
  it('adds an item and returns server-computed totals', async () => {
    const deps = harness();
    const result = await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.totals.subtotalPkr).toBe(7000);
  });

  it('persists the cart across calls for the same session', async () => {
    const deps = harness();
    await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 1 });
    const result = await getCart(deps, 'session-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cart.lines).toHaveLength(1);
  });

  it('never lets a caller influence the total — only quantity/menuItemId/variantId are accepted, price always comes from the menu', async () => {
    const deps = harness();
    const result = await addItem(deps, 'session-1', {
      menuItemId: 'steaks.ribeye',
      quantity: 1,
      // @ts-expect-error -- deliberately probing that an extra field can't smuggle a price through
      unitPricePkr: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.totals.subtotalPkr).toBe(3500);
  });

  it('rejects an out-of-range quantity', async () => {
    const deps = harness();
    const result = await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 500 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues?.[0]?.code).toBe('out_of_range');
  });

  it('rejects modifying to an out-of-range quantity', async () => {
    const deps = harness();
    await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 1 });
    const result = await modifyItem(deps, 'session-1', {
      cartLineId: 'steaks.ribeye:single',
      quantity: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues?.[0]?.code).toBe('out_of_range');
  });

  it('removes an item', async () => {
    const deps = harness();
    await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 1 });
    const result = await removeItem(deps, 'session-1', 'steaks.ribeye:single');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cart.lines).toEqual([]);
  });

  it('modifying or removing from a session with no cart yet fails NOT_FOUND', async () => {
    const deps = harness();
    const modifyResult = await modifyItem(deps, 'session-1', {
      cartLineId: 'anything',
      quantity: 1,
    });
    expect(modifyResult.ok).toBe(false);
    if (!modifyResult.ok) expect(modifyResult.error.code).toBe('NOT_FOUND');
  });
});

describe('cross-session isolation', () => {
  it("one session cannot see or affect another session's cart", async () => {
    const deps = harness();
    await addItem(deps, 'session-A', { menuItemId: 'steaks.ribeye', quantity: 3 });

    const bCart = await getCart(deps, 'session-B');
    expect(bCart.ok).toBe(true);
    if (bCart.ok) expect(bCart.value.cart.lines).toEqual([]);

    const bModify = await modifyItem(deps, 'session-B', {
      cartLineId: 'steaks.ribeye:single',
      quantity: 99,
    });
    expect(bModify.ok).toBe(false); // session B never created that line

    const aCart = await getCart(deps, 'session-A');
    expect(aCart.ok).toBe(true);
    if (aCart.ok) expect(aCart.value.cart.lines[0]?.quantity).toBe(3); // untouched by B's attempt
  });
});

describe('reviewTakeaway', () => {
  it('rejects reviewing a cart that exists but was emptied back out', async () => {
    const deps = harness();
    await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 1 });
    await removeItem(deps, 'session-1', 'steaks.ribeye:single');

    const result = await reviewTakeaway(deps, 'session-1', GUEST_DETAILS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues?.[0]?.code).toBe('empty_cart');
  });

  it('rejects reviewing a session with no cart at all', async () => {
    const deps = harness();
    const result = await reviewTakeaway(deps, 'never-added-anything', GUEST_DETAILS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('builds a review from the persisted cart', async () => {
    const deps = harness();
    await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 2 });
    const result = await reviewTakeaway(deps, 'session-1', GUEST_DETAILS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.review.totals.subtotalPkr).toBe(7000);
  });
});

describe('submitTakeaway', () => {
  async function reviewedSession(deps: TakeawayHttpDeps, sessionId: string) {
    await addItem(deps, sessionId, { menuItemId: 'steaks.ribeye', quantity: 1 });
    const prepared = await reviewTakeaway(deps, sessionId, GUEST_DETAILS);
    if (!prepared.ok) throw new Error('review failed in test setup');
    return prepared.value.confirmationToken;
  }

  it('submits and clears the cart on success', async () => {
    const deps = harness();
    const token = await reviewedSession(deps, 'session-1');

    const result = await submitTakeaway(deps, 'session-1', {
      ...GUEST_DETAILS,
      sourceChannel: 'WEB',
      confirmationToken: token,
      idempotencyKey: 'idem-key-0123456789',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(true);
    const cartAfter = await deps.cartStore.get('session-1');
    expect(cartAfter).toBeNull();
  });

  it('leaves the cart intact when submission fails (stale review)', async () => {
    const deps = harness();
    const token = await reviewedSession(deps, 'session-1');

    // Menu changes between review and submit.
    const depsWithChangedMenu: TakeawayHttpDeps = {
      ...deps,
      getMenuView: async () => ({
        ...MENU,
        categories: MENU.categories.map((c) => ({
          ...c,
          items: c.items.map((i) => (i.id === 'steaks.ribeye' ? { ...i, basePricePkr: 4000 } : i)),
        })),
      }),
    };

    const result = await submitTakeaway(depsWithChangedMenu, 'session-1', {
      ...GUEST_DETAILS,
      sourceChannel: 'WEB',
      confirmationToken: token,
      idempotencyKey: 'idem-key-9876543210',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STALE_REVIEW');
    const cartAfter = await deps.cartStore.get('session-1');
    expect(cartAfter?.lines).toHaveLength(1);
  });

  /*
   * Was `NOT_FOUND`, from an early return in `submitTakeaway` when no cart
   * was stored. That early return also broke retries, because a successful
   * submit *clears the cart*: a guest whose response was lost, retrying with
   * the same idempotency key, was told `NOT_FOUND` — that their request had
   * failed — when it had actually been created. See the retry test below.
   *
   * The cart check now happens inside the idempotent function, so a replay
   * resolves from the stored result and a genuinely empty submit is refused
   * as `empty_cart`. Still refused; more accurately named.
   */
  it('refuses to submit a session with no cart, as an empty cart', async () => {
    const deps = harness();
    const prepared = await prepareTakeawayRequest(deps, {
      sessionId: 'never-added-anything',
      cart: { id: 'x', sessionId: 'never-added-anything', menuVersionNumber: 1, lines: [] },
      ...GUEST_DETAILS,
    });
    if (!prepared.ok) throw new Error('unexpected prepare failure');

    const result = await submitTakeaway(deps, 'never-added-anything', {
      ...GUEST_DETAILS,
      sourceChannel: 'WEB',
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-nocart000000',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.issues?.[0]?.code).toBe('empty_cart');
    }
  });

  /*
   * The regression this whole change exists for, at the layer where it broke.
   *
   * Found by driving the real HTTP routes rather than the service: the
   * service's own idempotent-replay test passed the entire time, because the
   * early cart check sat *above* it and the service was never reached.
   */
  it('returns the original request on a retry after the cart was cleared', async () => {
    const deps = harness();
    const sessionId = 'retry-after-success';
    await addItem(deps, sessionId, { menuItemId: 'steaks.ribeye', quantity: 1 });

    const prepared = await reviewTakeaway(deps, sessionId, GUEST_DETAILS);
    if (!prepared.ok) throw new Error('unexpected review failure');

    const submitInput = {
      ...GUEST_DETAILS,
      sourceChannel: 'WEB' as const,
      confirmationToken: prepared.value.confirmationToken,
      idempotencyKey: 'idem-key-retry0000000',
      correlationId: 'corr-retry',
    };

    const first = await submitTakeaway(deps, sessionId, submitInput);
    expect(first.ok).toBe(true);

    // The cart is gone now. A guest whose response never arrived retries.
    expect(await deps.cartStore.get(sessionId)).toBeNull();
    const retry = await submitTakeaway(deps, sessionId, submitInput);

    expect(retry.ok).toBe(true);
    if (first.ok && retry.ok) {
      expect(retry.value.requestId).toBe(first.value.requestId);
    }
  });
});
