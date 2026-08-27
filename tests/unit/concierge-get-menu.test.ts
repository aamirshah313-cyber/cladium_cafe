import { describe, expect, it } from 'vitest';
import { getMenu } from '../../src/modules/concierge/tools/get-menu';
import { getPublishedMenuView, type PublishedMenuView } from '../../src/modules/menu/menu-view';

const FIXTURE: PublishedMenuView = {
  status: 'PUBLISHED',
  versionNumber: 3,
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
          servedWith: 'Fries',
        },
      ],
    },
    {
      id: 'beverages',
      name: 'Beverages',
      items: [
        {
          id: 'beverages.iced-tea',
          name: 'Iced Tea',
          groupLabel: null,
          availability: 'UNAVAILABLE',
          basePricePkr: 450,
          variants: [],
          isSignature: false,
          serves: null,
          servedWith: null,
        },
      ],
    },
  ],
};

describe('getMenu — tripwire', () => {
  it('defaults to the real getPublishedMenuView, which stays UNPUBLISHED (D-021)', () => {
    expect(getMenu({})).toEqual({ status: 'UNPUBLISHED' });
    expect(getPublishedMenuView()).toEqual({ status: 'UNPUBLISHED' });
  });
});

describe('getMenu — UNPUBLISHED', () => {
  it('reports UNPUBLISHED rather than any item, never a fabricated menu', () => {
    expect(getMenu({}, () => ({ status: 'UNPUBLISHED' }))).toEqual({ status: 'UNPUBLISHED' });
  });
});

describe('getMenu — PUBLISHED, browsing', () => {
  it('returns every category/item when no filter is given', () => {
    const result = getMenu({}, () => FIXTURE);
    expect(result).toEqual({ status: 'OK', versionNumber: 3, categories: FIXTURE.categories });
  });

  it('filters by query', () => {
    const result = getMenu({ query: 'ribeye' }, () => FIXTURE);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]?.id).toBe('steaks');
  });

  it('filters by category', () => {
    const result = getMenu({ category: 'beverages' }, () => FIXTURE);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.categories.map((c) => c.id)).toEqual(['beverages']);
  });

  it('still returns an UNAVAILABLE published item honestly, not hidden', () => {
    const result = getMenu({ category: 'beverages' }, () => FIXTURE);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.categories[0]?.items[0]?.availability).toBe('UNAVAILABLE');
  });
});

describe('getMenu — PUBLISHED, single item lookup', () => {
  it('finds an item by id across categories', () => {
    const result = getMenu({ itemId: 'beverages.iced-tea' }, () => FIXTURE);
    expect(result).toEqual({ status: 'OK_ITEM', item: FIXTURE.categories[1]?.items[0] });
  });

  it('reports ITEM_NOT_FOUND for an unknown id, never inventing one', () => {
    const result = getMenu({ itemId: 'no-such-item' }, () => FIXTURE);
    expect(result).toEqual({ status: 'ITEM_NOT_FOUND' });
  });

  it('itemId takes priority over query/category when both are somehow present', () => {
    const result = getMenu({ itemId: 'steaks.ribeye', query: 'iced tea' }, () => FIXTURE);
    expect(result.status).toBe('OK_ITEM');
  });
});
