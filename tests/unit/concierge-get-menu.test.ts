import { describe, expect, it } from 'vitest';
import { getMenu } from '../../src/modules/concierge/tools/get-menu';
import type { PublishedMenuView } from '../../src/modules/menu/menu-view';

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

describe('getMenu — UNPUBLISHED', () => {
  it('reports UNPUBLISHED rather than any item, never a fabricated menu', async () => {
    expect(await getMenu({}, async () => ({ status: 'UNPUBLISHED' }))).toEqual({
      status: 'UNPUBLISHED',
    });
  });
});

describe('getMenu — PUBLISHED, browsing', () => {
  it('returns every category/item when no filter is given', async () => {
    const result = await getMenu({}, async () => FIXTURE);
    expect(result).toEqual({ status: 'OK', versionNumber: 3, categories: FIXTURE.categories });
  });

  it('filters by query', async () => {
    const result = await getMenu({ query: 'ribeye' }, async () => FIXTURE);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]?.id).toBe('steaks');
  });

  it('filters by category', async () => {
    const result = await getMenu({ category: 'beverages' }, async () => FIXTURE);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.categories.map((c) => c.id)).toEqual(['beverages']);
  });

  it('still returns an UNAVAILABLE published item honestly, not hidden', async () => {
    const result = await getMenu({ category: 'beverages' }, async () => FIXTURE);
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.categories[0]?.items[0]?.availability).toBe('UNAVAILABLE');
  });
});

describe('getMenu — PUBLISHED, single item lookup', () => {
  it('finds an item by id across categories', async () => {
    const result = await getMenu({ itemId: 'beverages.iced-tea' }, async () => FIXTURE);
    expect(result).toEqual({ status: 'OK_ITEM', item: FIXTURE.categories[1]?.items[0] });
  });

  it('reports ITEM_NOT_FOUND for an unknown id, never inventing one', async () => {
    const result = await getMenu({ itemId: 'no-such-item' }, async () => FIXTURE);
    expect(result).toEqual({ status: 'ITEM_NOT_FOUND' });
  });

  it('itemId takes priority over query/category when both are somehow present', async () => {
    const result = await getMenu(
      { itemId: 'steaks.ribeye', query: 'iced tea' },
      async () => FIXTURE,
    );
    expect(result.status).toBe('OK_ITEM');
  });
});
