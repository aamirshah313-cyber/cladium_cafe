/**
 * Runbook Step 11 — deterministic menu diff report.
 *
 * Compares two normalized menu snapshots (see `adapter.ts`) by stable ID and
 * produces a plain-data report a staff member can read before an owner
 * approves a new menu version for publish. This is presentation of a
 * comparison only: it never touches a database, never decides anything, and
 * approval remains a separate, owner-authorized action (`menu_versions`
 * `review_status`/`approved_by`).
 */

import type {
  NormalizedMenuImport,
  NormalizedMenuCategory,
  NormalizedMenuItem,
  NormalizedMenuVariant,
} from './adapter';

export type DiffKind = 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED';

export interface CategoryDiffEntry {
  readonly stableId: string;
  readonly kind: DiffKind;
  readonly previous: NormalizedMenuCategory | null;
  readonly current: NormalizedMenuCategory | null;
  readonly changedFields: readonly string[];
}

export interface ItemDiffEntry {
  readonly stableId: string;
  readonly kind: DiffKind;
  readonly previous: NormalizedMenuItem | null;
  readonly current: NormalizedMenuItem | null;
  readonly changedFields: readonly string[];
  /** current.basePricePkr - previous.basePricePkr; null unless both sides are single-priced and differ. */
  readonly priceChangePkr: number | null;
}

export interface VariantDiffEntry {
  readonly stableId: string;
  readonly kind: DiffKind;
  readonly previous: NormalizedMenuVariant | null;
  readonly current: NormalizedMenuVariant | null;
  readonly changedFields: readonly string[];
  readonly priceChangePkr: number | null;
}

export interface MenuDiffReport {
  readonly previousSourceChecksum: string | null;
  readonly currentSourceChecksum: string;
  readonly categories: readonly CategoryDiffEntry[];
  readonly items: readonly ItemDiffEntry[];
  readonly variants: readonly VariantDiffEntry[];
  readonly summary: {
    readonly categoriesAdded: number;
    readonly categoriesRemoved: number;
    readonly categoriesChanged: number;
    readonly itemsAdded: number;
    readonly itemsRemoved: number;
    readonly itemsChanged: number;
    readonly variantsAdded: number;
    readonly variantsRemoved: number;
    readonly variantsChanged: number;
    readonly priceIncreaseCount: number;
    readonly priceDecreaseCount: number;
  };
}

function byStableId<T extends { readonly stableId: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.stableId, row]));
}

/** current rows in current order, then any previous-only (removed) rows in previous order. */
function orderedStableIds<T extends { readonly stableId: string }>(
  current: readonly T[],
  previous: readonly T[],
): string[] {
  const currentIds = current.map((row) => row.stableId);
  const currentIdSet = new Set(currentIds);
  const removedOnly = previous.map((row) => row.stableId).filter((id) => !currentIdSet.has(id));
  return [...currentIds, ...removedOnly];
}

function diffCategory(
  stableId: string,
  previous: NormalizedMenuCategory | undefined,
  current: NormalizedMenuCategory | undefined,
): CategoryDiffEntry {
  if (!previous && current) {
    return { stableId, kind: 'ADDED', previous: null, current, changedFields: [] };
  }
  if (previous && !current) {
    return { stableId, kind: 'REMOVED', previous, current: null, changedFields: [] };
  }
  const p = previous as NormalizedMenuCategory;
  const c = current as NormalizedMenuCategory;
  const changedFields: string[] = [];
  if (p.name !== c.name) changedFields.push('name');
  if (p.sortOrder !== c.sortOrder) changedFields.push('sortOrder');
  return {
    stableId,
    kind: changedFields.length > 0 ? 'CHANGED' : 'UNCHANGED',
    previous: p,
    current: c,
    changedFields,
  };
}

const ITEM_COMPARED_FIELDS: readonly (keyof NormalizedMenuItem)[] = [
  'categoryStableId',
  'groupLabel',
  'name',
  'basePricePkr',
  'isSignature',
  'serves',
  'quantityLabel',
  'servedWith',
  'sortOrder',
];

function diffItem(
  stableId: string,
  previous: NormalizedMenuItem | undefined,
  current: NormalizedMenuItem | undefined,
): ItemDiffEntry {
  if (!previous && current) {
    return {
      stableId,
      kind: 'ADDED',
      previous: null,
      current,
      changedFields: [],
      priceChangePkr: null,
    };
  }
  if (previous && !current) {
    return {
      stableId,
      kind: 'REMOVED',
      previous,
      current: null,
      changedFields: [],
      priceChangePkr: null,
    };
  }
  const p = previous as NormalizedMenuItem;
  const c = current as NormalizedMenuItem;
  const changedFields = ITEM_COMPARED_FIELDS.filter((field) => p[field] !== c[field]);
  const priceChangePkr =
    p.basePricePkr !== null && c.basePricePkr !== null && p.basePricePkr !== c.basePricePkr
      ? c.basePricePkr - p.basePricePkr
      : null;
  return {
    stableId,
    kind: changedFields.length > 0 ? 'CHANGED' : 'UNCHANGED',
    previous: p,
    current: c,
    changedFields,
    priceChangePkr,
  };
}

const VARIANT_COMPARED_FIELDS: readonly (keyof NormalizedMenuVariant)[] = [
  'itemStableId',
  'label',
  'pricePkr',
  'sortOrder',
];

function diffVariant(
  stableId: string,
  previous: NormalizedMenuVariant | undefined,
  current: NormalizedMenuVariant | undefined,
): VariantDiffEntry {
  if (!previous && current) {
    return {
      stableId,
      kind: 'ADDED',
      previous: null,
      current,
      changedFields: [],
      priceChangePkr: null,
    };
  }
  if (previous && !current) {
    return {
      stableId,
      kind: 'REMOVED',
      previous,
      current: null,
      changedFields: [],
      priceChangePkr: null,
    };
  }
  const p = previous as NormalizedMenuVariant;
  const c = current as NormalizedMenuVariant;
  const changedFields = VARIANT_COMPARED_FIELDS.filter((field) => p[field] !== c[field]);
  const priceChangePkr = p.pricePkr !== c.pricePkr ? c.pricePkr - p.pricePkr : null;
  return {
    stableId,
    kind: changedFields.length > 0 ? 'CHANGED' : 'UNCHANGED',
    previous: p,
    current: c,
    changedFields,
    priceChangePkr,
  };
}

/**
 * `previous` is `null` for a first-ever import: every category/item/variant
 * in `current` is then reported as ADDED.
 */
export function buildMenuDiffReport(
  previous: NormalizedMenuImport | null,
  current: NormalizedMenuImport,
): MenuDiffReport {
  const previousCategories = previous?.categories ?? [];
  const previousItems = previous?.items ?? [];
  const previousVariants = previous?.variants ?? [];

  const previousCategoryMap = byStableId(previousCategories);
  const currentCategoryMap = byStableId(current.categories);
  const categories = orderedStableIds(current.categories, previousCategories).map((stableId) =>
    diffCategory(stableId, previousCategoryMap.get(stableId), currentCategoryMap.get(stableId)),
  );

  const previousItemMap = byStableId(previousItems);
  const currentItemMap = byStableId(current.items);
  const items = orderedStableIds(current.items, previousItems).map((stableId) =>
    diffItem(stableId, previousItemMap.get(stableId), currentItemMap.get(stableId)),
  );

  const previousVariantMap = byStableId(previousVariants);
  const currentVariantMap = byStableId(current.variants);
  const variants = orderedStableIds(current.variants, previousVariants).map((stableId) =>
    diffVariant(stableId, previousVariantMap.get(stableId), currentVariantMap.get(stableId)),
  );

  const priceChanges = [
    ...items.map((i) => i.priceChangePkr),
    ...variants.map((v) => v.priceChangePkr),
  ];

  return {
    previousSourceChecksum: previous?.sourceChecksum ?? null,
    currentSourceChecksum: current.sourceChecksum,
    categories,
    items,
    variants,
    summary: {
      categoriesAdded: categories.filter((c) => c.kind === 'ADDED').length,
      categoriesRemoved: categories.filter((c) => c.kind === 'REMOVED').length,
      categoriesChanged: categories.filter((c) => c.kind === 'CHANGED').length,
      itemsAdded: items.filter((i) => i.kind === 'ADDED').length,
      itemsRemoved: items.filter((i) => i.kind === 'REMOVED').length,
      itemsChanged: items.filter((i) => i.kind === 'CHANGED').length,
      variantsAdded: variants.filter((v) => v.kind === 'ADDED').length,
      variantsRemoved: variants.filter((v) => v.kind === 'REMOVED').length,
      variantsChanged: variants.filter((v) => v.kind === 'CHANGED').length,
      priceIncreaseCount: priceChanges.filter((change) => change !== null && change > 0).length,
      priceDecreaseCount: priceChanges.filter((change) => change !== null && change < 0).length,
    },
  };
}
