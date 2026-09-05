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

  it('fails NOT_FOUND submitting for a session with no cart', async () => {
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
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});
