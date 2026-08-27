import { describe, expect, it } from 'vitest';
import { createInMemorySink } from '../../src/lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../src/lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../src/lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import { createInMemoryCartStore } from '../../src/modules/takeaway/cart-store';
import { addItem, type TakeawayHttpDeps } from '../../src/modules/takeaway/http';
import { viewCart } from '../../src/modules/concierge/tools/view-cart';
import type { PublishedMenuView } from '../../src/modules/menu/menu-view';
import type {
  TakeawayItemSnapshot,
  TakeawayRequestRecord,
} from '../../src/modules/takeaway/request';

const NOW = () => new Date('2026-08-27T12:00:00Z');

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

function harness(menu: PublishedMenuView = MENU): TakeawayHttpDeps {
  let idCounter = 0;
  return {
    getMenuView: () => menu,
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
}

describe('viewCart — thin wrapper over modules/takeaway/http.ts getCart', () => {
  it('returns an empty cart for a session with nothing added yet', async () => {
    const deps = harness();
    const result = await viewCart(deps, 'session-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cart.lines).toEqual([]);
  });

  it('returns server-computed totals, never something the caller supplies', async () => {
    const deps = harness();
    await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 2 });

    const result = await viewCart(deps, 'session-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.totals.subtotalPkr).toBe(7000);
  });

  it("a different session sees its own (empty) cart, never another session's", async () => {
    const deps = harness();
    await addItem(deps, 'session-1', { menuItemId: 'steaks.ribeye', quantity: 1 });

    const result = await viewCart(deps, 'session-2');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cart.lines).toEqual([]);
  });

  it('fails FEATURE_DISABLED when the menu is not published', async () => {
    const deps = harness({ status: 'UNPUBLISHED' });
    const result = await viewCart(deps, 'session-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FEATURE_DISABLED');
  });
});
