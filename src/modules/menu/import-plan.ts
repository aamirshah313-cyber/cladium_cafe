/**
 * Runbook Step 11 — deterministic menu import plan.
 *
 * Turns a `NormalizedMenuImport` (see `adapter.ts`) into a concrete,
 * DB-shaped plan for inserting an unpublished `menu_versions` row plus its
 * categories/items/variants — or recognizing that the same source checksum
 * was already imported, so re-running the import is a safe no-op
 * (`menu_versions.source_checksum` is unique).
 *
 * This module never opens a database connection and never writes anything.
 * It only computes what a later, separately reviewed step would execute
 * inside a transaction, and it never assigns publish_state other than the
 * DRAFT every row starts in.
 */

import { ok, err, type Result } from '../../lib/result';
import { validationFailed, type AppError, type FieldIssue } from '../../lib/errors';
import type { NormalizedMenuImport } from './adapter';

export interface ExistingMenuVersionRef {
  readonly versionNumber: number;
  readonly sourceChecksum: string;
}

export interface PlannedCategoryRow {
  readonly stableId: string;
  readonly name: string;
  readonly sortOrder: number;
}

export interface PlannedItemRow {
  readonly stableId: string;
  readonly categoryStableId: string;
  readonly groupLabel: string | null;
  readonly name: string;
  readonly basePricePkr: number | null;
  readonly isSignature: boolean;
  readonly serves: string | null;
  readonly quantityLabel: string | null;
  readonly servedWith: string | null;
  readonly sortOrder: number;
}

export interface PlannedVariantRow {
  readonly stableId: string;
  readonly itemStableId: string;
  readonly label: string;
  readonly pricePkr: number;
  readonly sortOrder: number;
}

export type MenuImportPlanAction =
  | { readonly kind: 'ALREADY_IMPORTED'; readonly matchedVersionNumber: number }
  | { readonly kind: 'CREATE_DRAFT_VERSION'; readonly versionNumber: number };

export interface MenuImportPlan {
  readonly action: MenuImportPlanAction;
  readonly sourceChecksum: string;
  readonly sourceReferences: readonly string[];
  readonly categories: readonly PlannedCategoryRow[];
  readonly items: readonly PlannedItemRow[];
  readonly variants: readonly PlannedVariantRow[];
  readonly summary: NormalizedMenuImport['summary'];
}

function nextVersionNumber(existing: readonly ExistingMenuVersionRef[]): number {
  return existing.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
}

/**
 * Re-checks the structural invariants the destination schema enforces by
 * constraint: unique stable IDs per version, every item/variant pointing at
 * a real parent, and exactly one price shape per item. `normalizeMenuSource`
 * already guarantees this for its own output, but a plan must not trust an
 * input it did not just parse itself — a caller may reconstruct a
 * `NormalizedMenuImport` from stored or transmitted data instead of calling
 * the adapter directly.
 */
function checkStructuralIntegrity(menu: NormalizedMenuImport): FieldIssue[] {
  const issues: FieldIssue[] = [];

  const categoryIds = new Set<string>();
  for (const category of menu.categories) {
    if (categoryIds.has(category.stableId)) {
      issues.push({ path: `categories.${category.stableId}`, code: 'duplicate_stable_id' });
    }
    categoryIds.add(category.stableId);
  }

  const itemIds = new Set<string>();
  const itemById = new Map<string, NormalizedMenuImport['items'][number]>();
  for (const item of menu.items) {
    if (itemIds.has(item.stableId)) {
      issues.push({ path: `items.${item.stableId}`, code: 'duplicate_stable_id' });
    }
    itemIds.add(item.stableId);
    itemById.set(item.stableId, item);

    if (!categoryIds.has(item.categoryStableId)) {
      issues.push({
        path: `items.${item.stableId}.categoryStableId`,
        code: 'orphan_category_reference',
      });
    }
  }

  const variantIds = new Set<string>();
  const variantCountByItem = new Map<string, number>();
  for (const variant of menu.variants) {
    if (variantIds.has(variant.stableId)) {
      issues.push({ path: `variants.${variant.stableId}`, code: 'duplicate_stable_id' });
    }
    variantIds.add(variant.stableId);

    const parentItem = itemById.get(variant.itemStableId);
    if (!parentItem) {
      issues.push({
        path: `variants.${variant.stableId}.itemStableId`,
        code: 'orphan_item_reference',
      });
    } else if (parentItem.basePricePkr !== null) {
      issues.push({
        path: `variants.${variant.stableId}.itemStableId`,
        code: 'variant_on_single_priced_item',
      });
    }

    variantCountByItem.set(
      variant.itemStableId,
      (variantCountByItem.get(variant.itemStableId) ?? 0) + 1,
    );
  }

  for (const item of menu.items) {
    const variantCount = variantCountByItem.get(item.stableId) ?? 0;
    const hasSinglePrice = item.basePricePkr !== null;
    if (hasSinglePrice === variantCount > 0) {
      issues.push({
        path: `items.${item.stableId}.price`,
        code: 'exactly_one_price_shape_required',
      });
    }
  }

  return issues;
}

/**
 * Builds the import plan. Returns `Err` on a structural integrity problem
 * rather than planning a partial or inconsistent import.
 */
export function buildMenuImportPlan(
  menu: NormalizedMenuImport,
  existingVersions: readonly ExistingMenuVersionRef[],
): Result<MenuImportPlan, AppError> {
  const structuralIssues = checkStructuralIntegrity(menu);
  if (structuralIssues.length > 0) {
    return err(validationFailed(structuralIssues));
  }

  const categories: PlannedCategoryRow[] = menu.categories.map((category) => ({
    stableId: category.stableId,
    name: category.name,
    sortOrder: category.sortOrder,
  }));

  const items: PlannedItemRow[] = menu.items.map((item) => ({
    stableId: item.stableId,
    categoryStableId: item.categoryStableId,
    groupLabel: item.groupLabel,
    name: item.name,
    basePricePkr: item.basePricePkr,
    isSignature: item.isSignature,
    serves: item.serves,
    quantityLabel: item.quantityLabel,
    servedWith: item.servedWith,
    sortOrder: item.sortOrder,
  }));

  const variants: PlannedVariantRow[] = menu.variants.map((variant) => ({
    stableId: variant.stableId,
    itemStableId: variant.itemStableId,
    label: variant.label,
    pricePkr: variant.pricePkr,
    sortOrder: variant.sortOrder,
  }));

  const matched = existingVersions.find(
    (version) => version.sourceChecksum === menu.sourceChecksum,
  );
  const action: MenuImportPlanAction = matched
    ? { kind: 'ALREADY_IMPORTED', matchedVersionNumber: matched.versionNumber }
    : { kind: 'CREATE_DRAFT_VERSION', versionNumber: nextVersionNumber(existingVersions) };

  return ok({
    action,
    sourceChecksum: menu.sourceChecksum,
    sourceReferences: menu.sourceReferences,
    categories,
    items,
    variants,
    summary: menu.summary,
  });
}
