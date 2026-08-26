import { describe, expect, it } from 'vitest';
import {
  filterMenuCategories,
  getPublishedMenuView,
  type MenuViewCategory,
} from '../../src/modules/menu/menu-view';

describe('getPublishedMenuView', () => {
  it('is UNPUBLISHED — no menu is owner-approved/published yet (Gate 0/Gate 2)', () => {
    expect(getPublishedMenuView()).toEqual({ status: 'UNPUBLISHED' });
  });
});

const FIXTURE_CATEGORIES: readonly MenuViewCategory[] = [
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
];

describe('filterMenuCategories', () => {
  it('returns everything unfiltered', () => {
    expect(filterMenuCategories(FIXTURE_CATEGORIES, {})).toEqual(FIXTURE_CATEGORIES);
  });

  it('matches an item name case-insensitively', () => {
    const result = filterMenuCategories(FIXTURE_CATEGORIES, { query: 'ribeye' });
    expect(result).toHaveLength(1);
    expect(result[0]?.items.map((item) => item.id)).toEqual(['steaks.ribeye']);
  });

  it('matches a group label', () => {
    const result = filterMenuCategories(FIXTURE_CATEGORIES, { query: 'beef' });
    expect(result[0]?.items.map((item) => item.id)).toEqual(['steaks.sirloin']);
  });

  it('drops a category left with zero matching items rather than showing it empty', () => {
    const result = filterMenuCategories(FIXTURE_CATEGORIES, { query: 'ribeye' });
    expect(result.map((category) => category.id)).toEqual(['steaks']);
  });

  it('filters by category id', () => {
    const result = filterMenuCategories(FIXTURE_CATEGORIES, { categoryId: 'beverages' });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('beverages');
  });

  it('combines category and query filters', () => {
    const result = filterMenuCategories(FIXTURE_CATEGORIES, {
      categoryId: 'steaks',
      query: 'iced tea',
    });
    expect(result).toEqual([]);
  });

  it('returns no categories when nothing matches the query', () => {
    expect(filterMenuCategories(FIXTURE_CATEGORIES, { query: 'sushi' })).toEqual([]);
  });

  it('treats a blank query the same as no query', () => {
    expect(filterMenuCategories(FIXTURE_CATEGORIES, { query: '   ' })).toEqual(FIXTURE_CATEGORIES);
  });
});
