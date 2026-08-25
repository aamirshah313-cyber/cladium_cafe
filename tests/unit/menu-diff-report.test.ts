import { describe, expect, it } from 'vitest';
import { buildMenuDiffReport } from '../../src/modules/menu/diff-report';
import type {
  NormalizedMenuCategory,
  NormalizedMenuImport,
  NormalizedMenuItem,
  NormalizedMenuVariant,
} from '../../src/modules/menu/adapter';

const startersCategory: NormalizedMenuCategory = {
  stableId: 'starters',
  name: 'Starters',
  sortOrder: 0,
};

const soupItem: NormalizedMenuItem = {
  stableId: 'starters.soup',
  categoryStableId: 'starters',
  groupLabel: null,
  name: 'Soup',
  basePricePkr: 500,
  isSignature: false,
  serves: null,
  quantityLabel: null,
  servedWith: null,
  sortOrder: 0,
};

const platterItem: NormalizedMenuItem = {
  stableId: 'starters.platter',
  categoryStableId: 'starters',
  groupLabel: null,
  name: 'Platter',
  basePricePkr: null,
  isSignature: false,
  serves: null,
  quantityLabel: null,
  servedWith: null,
  sortOrder: 0,
};

const platterFullVariant: NormalizedMenuVariant = {
  stableId: 'starters.platter.full',
  itemStableId: 'starters.platter',
  label: 'Full',
  pricePkr: 1500,
  sortOrder: 0,
};

function baseMenu(overrides: Partial<NormalizedMenuImport> = {}): NormalizedMenuImport {
  return {
    sourceChecksum: 'a'.repeat(64),
    sourceReferences: ['page-1.jpg'],
    categories: [startersCategory],
    items: [soupItem],
    variants: [],
    unmappedFields: [],
    summary: {
      categoryCount: 1,
      itemCount: 1,
      variantCount: 0,
      singlePriceItemCount: 1,
      variantPriceItemCount: 0,
    },
    ...overrides,
  };
}

describe('buildMenuDiffReport', () => {
  it('reports everything as ADDED for a first-ever import', () => {
    const current = baseMenu();
    const report = buildMenuDiffReport(null, current);
    expect(report.previousSourceChecksum).toBeNull();
    expect(report.categories).toEqual([
      {
        stableId: 'starters',
        kind: 'ADDED',
        previous: null,
        current: startersCategory,
        changedFields: [],
      },
    ]);
    expect(report.summary.itemsAdded).toBe(1);
    expect(report.summary.itemsChanged).toBe(0);
  });

  it('reports UNCHANGED when nothing differs', () => {
    const menu = baseMenu();
    const report = buildMenuDiffReport(menu, menu);
    expect(report.categories.every((c) => c.kind === 'UNCHANGED')).toBe(true);
    expect(report.items.every((i) => i.kind === 'UNCHANGED')).toBe(true);
    expect(report.summary).toMatchObject({
      categoriesAdded: 0,
      categoriesRemoved: 0,
      categoriesChanged: 0,
      itemsAdded: 0,
      itemsRemoved: 0,
      itemsChanged: 0,
    });
  });

  it('computes the price delta for a changed single-price item', () => {
    const previous = baseMenu();
    const current = baseMenu({
      items: [{ ...soupItem, basePricePkr: 650 }],
    });
    const report = buildMenuDiffReport(previous, current);
    const soupDiff = report.items.find((i) => i.stableId === 'starters.soup');
    expect(soupDiff?.kind).toBe('CHANGED');
    expect(soupDiff?.changedFields).toEqual(['basePricePkr']);
    expect(soupDiff?.priceChangePkr).toBe(150);
    expect(report.summary.priceIncreaseCount).toBe(1);
    expect(report.summary.priceDecreaseCount).toBe(0);
  });

  it('reports a removed category and item', () => {
    const previous = baseMenu();
    const current = baseMenu({ categories: [], items: [] });
    const report = buildMenuDiffReport(previous, current);
    expect(report.categories).toEqual([
      {
        stableId: 'starters',
        kind: 'REMOVED',
        previous: startersCategory,
        current: null,
        changedFields: [],
      },
    ]);
    expect(report.summary.itemsRemoved).toBe(1);
  });

  it('computes the price delta for a changed variant and flags a decrease', () => {
    const previous = baseMenu({
      items: [platterItem],
      variants: [platterFullVariant],
    });
    const current = baseMenu({
      items: [platterItem],
      variants: [{ ...platterFullVariant, pricePkr: 1400 }],
    });
    const report = buildMenuDiffReport(previous, current);
    const variantDiff = report.variants.find((v) => v.stableId === 'starters.platter.full');
    expect(variantDiff?.kind).toBe('CHANGED');
    expect(variantDiff?.priceChangePkr).toBe(-100);
    expect(report.summary.priceDecreaseCount).toBe(1);
  });
});
