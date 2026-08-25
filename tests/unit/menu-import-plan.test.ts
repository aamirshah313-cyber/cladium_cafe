import { describe, expect, it } from 'vitest';
import {
  buildMenuImportPlan,
  type ExistingMenuVersionRef,
} from '../../src/modules/menu/import-plan';
import type { NormalizedMenuImport } from '../../src/modules/menu/adapter';

function validMenu(overrides: Partial<NormalizedMenuImport> = {}): NormalizedMenuImport {
  return {
    sourceChecksum: 'a'.repeat(64),
    sourceReferences: ['page-1.jpg'],
    categories: [{ stableId: 'starters', name: 'Starters', sortOrder: 0 }],
    items: [
      {
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
      },
      {
        stableId: 'starters.platter',
        categoryStableId: 'starters',
        groupLabel: null,
        name: 'Platter',
        basePricePkr: null,
        isSignature: true,
        serves: '2',
        quantityLabel: null,
        servedWith: null,
        sortOrder: 1,
      },
    ],
    variants: [
      {
        stableId: 'starters.platter.half',
        itemStableId: 'starters.platter',
        label: 'Half',
        pricePkr: 800,
        sortOrder: 0,
      },
      {
        stableId: 'starters.platter.full',
        itemStableId: 'starters.platter',
        label: 'Full',
        pricePkr: 1500,
        sortOrder: 1,
      },
    ],
    unmappedFields: [],
    summary: {
      categoryCount: 1,
      itemCount: 2,
      variantCount: 2,
      singlePriceItemCount: 1,
      variantPriceItemCount: 1,
    },
    ...overrides,
  };
}

describe('buildMenuImportPlan', () => {
  it('plans a draft version 1 when nothing has been imported yet', () => {
    const result = buildMenuImportPlan(validMenu(), []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toEqual({ kind: 'CREATE_DRAFT_VERSION', versionNumber: 1 });
    expect(result.value.categories).toHaveLength(1);
    expect(result.value.items).toHaveLength(2);
    expect(result.value.variants).toHaveLength(2);
  });

  it('numbers the next draft version after the highest existing version', () => {
    const existing: ExistingMenuVersionRef[] = [
      { versionNumber: 1, sourceChecksum: 'b'.repeat(64) },
      { versionNumber: 3, sourceChecksum: 'c'.repeat(64) },
    ];
    const result = buildMenuImportPlan(validMenu(), existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toEqual({ kind: 'CREATE_DRAFT_VERSION', versionNumber: 4 });
  });

  it('recognizes a repeat import of the same source as a no-op', () => {
    const checksum = 'd'.repeat(64);
    const existing: ExistingMenuVersionRef[] = [{ versionNumber: 2, sourceChecksum: checksum }];
    const result = buildMenuImportPlan(validMenu({ sourceChecksum: checksum }), existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.action).toEqual({ kind: 'ALREADY_IMPORTED', matchedVersionNumber: 2 });
  });

  it('rejects a duplicate stable ID across categories', () => {
    const menu = validMenu({
      categories: [
        { stableId: 'starters', name: 'Starters', sortOrder: 0 },
        { stableId: 'starters', name: 'Starters Again', sortOrder: 1 },
      ],
    });
    const result = buildMenuImportPlan(menu, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toContainEqual({
      path: 'categories.starters',
      code: 'duplicate_stable_id',
    });
  });

  it('rejects an item that references a category that does not exist', () => {
    const menu = validMenu({
      items: [
        {
          stableId: 'starters.soup',
          categoryStableId: 'missing-category',
          groupLabel: null,
          name: 'Soup',
          basePricePkr: 500,
          isSignature: false,
          serves: null,
          quantityLabel: null,
          servedWith: null,
          sortOrder: 0,
        },
      ],
      variants: [],
    });
    const result = buildMenuImportPlan(menu, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toContainEqual({
      path: 'items.starters.soup.categoryStableId',
      code: 'orphan_category_reference',
    });
  });

  it('rejects a variant that references an item that does not exist', () => {
    const menu = validMenu({
      variants: [
        {
          stableId: 'starters.platter.half',
          itemStableId: 'no-such-item',
          label: 'Half',
          pricePkr: 800,
          sortOrder: 0,
        },
        {
          stableId: 'starters.platter.full',
          itemStableId: 'starters.platter',
          label: 'Full',
          pricePkr: 1500,
          sortOrder: 1,
        },
      ],
    });
    const result = buildMenuImportPlan(menu, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toContainEqual({
      path: 'variants.starters.platter.half.itemStableId',
      code: 'orphan_item_reference',
    });
  });

  it('rejects a variant attached to an item that already has a single price', () => {
    const menu = validMenu({
      variants: [
        {
          stableId: 'starters.soup.large',
          itemStableId: 'starters.soup',
          label: 'Large',
          pricePkr: 700,
          sortOrder: 0,
        },
        {
          stableId: 'starters.platter.half',
          itemStableId: 'starters.platter',
          label: 'Half',
          pricePkr: 800,
          sortOrder: 0,
        },
        {
          stableId: 'starters.platter.full',
          itemStableId: 'starters.platter',
          label: 'Full',
          pricePkr: 1500,
          sortOrder: 1,
        },
      ],
    });
    const result = buildMenuImportPlan(menu, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toContainEqual({
      path: 'variants.starters.soup.large.itemStableId',
      code: 'variant_on_single_priced_item',
    });
  });

  it('rejects an item with neither a base price nor any variants', () => {
    const menu = validMenu({
      items: [
        {
          stableId: 'starters.mystery',
          categoryStableId: 'starters',
          groupLabel: null,
          name: 'Mystery',
          basePricePkr: null,
          isSignature: false,
          serves: null,
          quantityLabel: null,
          servedWith: null,
          sortOrder: 0,
        },
      ],
      variants: [],
    });
    const result = buildMenuImportPlan(menu, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toContainEqual({
      path: 'items.starters.mystery.price',
      code: 'exactly_one_price_shape_required',
    });
  });
});
