import { describe, expect, it } from 'vitest';
import {
  addItemToCart,
  emptyCart,
  modifyCartItem,
  recomputeCartTotals,
  removeCartItem,
} from '../../src/modules/takeaway/cart';
import type { PublishedMenuView } from '../../src/modules/menu/menu-view';

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
        {
          id: 'steaks.sirloin',
          name: 'Sirloin Steak',
          groupLabel: 'Beef',
          availability: 'UNKNOWN',
          basePricePkr: null,
          variants: [
            { id: 'steaks.sirloin.regular', label: 'Regular', pricePkr: 2800 },
            { id: 'steaks.sirloin.large', label: 'Large', pricePkr: 3600 },
          ],
          isSignature: false,
          serves: null,
          servedWith: null,
        },
        {
          id: 'steaks.tbone',
          name: 'T-Bone Steak',
          groupLabel: null,
          availability: 'UNAVAILABLE',
          basePricePkr: 4200,
          variants: [],
          isSignature: false,
          serves: null,
          servedWith: null,
        },
      ],
    },
  ],
};

const CART = emptyCart('cart-1', 'session-1', 1);

describe('addItemToCart', () => {
  it('adds a single-priced item', () => {
    const result = addItemToCart(CART, MENU, { menuItemId: 'steaks.ribeye', quantity: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines).toEqual([
        { id: 'steaks.ribeye:single', menuItemId: 'steaks.ribeye', variantId: null, quantity: 2 },
      ]);
    }
  });

  it('adds a variant-priced item when a valid variant is chosen', () => {
    const result = addItemToCart(CART, MENU, {
      menuItemId: 'steaks.sirloin',
      variantId: 'steaks.sirloin.large',
      quantity: 1,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a variant-priced item with no variant chosen', () => {
    const result = addItemToCart(CART, MENU, { menuItemId: 'steaks.sirloin', quantity: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues?.[0]?.code).toBe('required_choice');
  });

  it('rejects a variant id on a single-priced item', () => {
    const result = addItemToCart(CART, MENU, {
      menuItemId: 'steaks.ribeye',
      variantId: 'not-a-real-variant',
      quantity: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues?.[0]?.code).toBe('item_has_no_variants');
  });

  it('rejects an unavailable item', () => {
    const result = addItemToCart(CART, MENU, { menuItemId: 'steaks.tbone', quantity: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues?.[0]?.code).toBe('item_unavailable');
  });

  it('allows an UNKNOWN-availability item — staff confirms later, this is not a promise', () => {
    const result = addItemToCart(CART, MENU, {
      menuItemId: 'steaks.sirloin',
      variantId: 'steaks.sirloin.regular',
      quantity: 1,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown item id', () => {
    const result = addItemToCart(CART, MENU, { menuItemId: 'nonexistent', quantity: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects a quantity out of range', () => {
    const result = addItemToCart(CART, MENU, { menuItemId: 'steaks.ribeye', quantity: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.issues?.[0]?.code).toBe('out_of_range');
  });

  it('merges a repeated add into the same line, summing quantity', () => {
    const once = addItemToCart(CART, MENU, { menuItemId: 'steaks.ribeye', quantity: 1 });
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = addItemToCart(once.value, MENU, { menuItemId: 'steaks.ribeye', quantity: 1 });
    expect(twice.ok).toBe(true);
    if (twice.ok) {
      expect(twice.value.lines).toHaveLength(1);
      expect(twice.value.lines[0]?.quantity).toBe(2);
    }
  });
});

describe('modifyCartItem / removeCartItem', () => {
  function cartWithOneRibeye() {
    const result = addItemToCart(CART, MENU, { menuItemId: 'steaks.ribeye', quantity: 1 });
    if (!result.ok) throw new Error('fixture setup failed');
    return result.value;
  }

  it('modifies the quantity of an existing line', () => {
    const result = modifyCartItem(cartWithOneRibeye(), {
      cartLineId: 'steaks.ribeye:single',
      quantity: 5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.lines[0]?.quantity).toBe(5);
  });

  it('rejects modifying a line that does not exist', () => {
    const result = modifyCartItem(CART, { cartLineId: 'missing', quantity: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('removes an existing line', () => {
    const result = removeCartItem(cartWithOneRibeye(), 'steaks.ribeye:single');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.lines).toHaveLength(0);
  });

  it('rejects removing a line that does not exist', () => {
    const result = removeCartItem(CART, 'missing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('recomputeCartTotals', () => {
  it('computes line totals and subtotal from the menu, never trusting a stored price', () => {
    const withItems = addItemToCart(CART, MENU, { menuItemId: 'steaks.ribeye', quantity: 2 });
    expect(withItems.ok).toBe(true);
    if (!withItems.ok) return;
    const withVariant = addItemToCart(withItems.value, MENU, {
      menuItemId: 'steaks.sirloin',
      variantId: 'steaks.sirloin.large',
      quantity: 1,
    });
    expect(withVariant.ok).toBe(true);
    if (!withVariant.ok) return;

    const totals = recomputeCartTotals(withVariant.value, MENU);
    expect(totals.ok).toBe(true);
    if (totals.ok) {
      expect(totals.value.subtotalPkr).toBe(2 * 3500 + 3600);
      expect(totals.value.lines).toHaveLength(2);
      expect(totals.value.lines.find((l) => l.menuItemId === 'steaks.sirloin')?.variantLabel).toBe(
        'Large',
      );
    }
  });

  it('fails recomputation if an item became unavailable since it was added', () => {
    const withItem = addItemToCart(CART, MENU, { menuItemId: 'steaks.ribeye', quantity: 1 });
    expect(withItem.ok).toBe(true);
    if (!withItem.ok) return;

    const menuWithItemPulled: PublishedMenuView = {
      ...MENU,
      categories: MENU.categories.map((c) => ({
        ...c,
        items: c.items.map((i) =>
          i.id === 'steaks.ribeye' ? { ...i, availability: 'UNAVAILABLE' } : i,
        ),
      })),
    };

    const totals = recomputeCartTotals(withItem.value, menuWithItemPulled);
    expect(totals.ok).toBe(false);
  });

  it('fails STALE_REVIEW immediately when the published menu version has moved on', () => {
    const withItem = addItemToCart(CART, MENU, { menuItemId: 'steaks.ribeye', quantity: 1 });
    expect(withItem.ok).toBe(true);
    if (!withItem.ok) return;

    const newerMenuVersion: PublishedMenuView = { ...MENU, versionNumber: 2 };

    const totals = recomputeCartTotals(withItem.value, newerMenuVersion);
    expect(totals.ok).toBe(false);
    if (!totals.ok) expect(totals.error.code).toBe('STALE_REVIEW');
  });
});
