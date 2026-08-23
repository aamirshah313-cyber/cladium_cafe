const EXPECTED_CURRENCY = 'PKR';

// Verified by hand at Runbook Step 3 (2026-08-23) by running this validator
// against cladium-research/data/menu.json after fixing the grouped-item bug
// (see .continuum/DECISIONS.md D-015). Any run whose totals differ from this
// baseline hard-fails — a real, deliberate source-data change must update
// this constant by hand (never programmatically) and be recorded in
// .continuum/DECISIONS.md, not silently absorbed.
export const VERIFIED_MENU_BASELINE = Object.freeze({
  totalItems: 118,
  categoryCount: 12,
  singlePrice: 100,
  variantPrice: 18,
  missingPrice: 0,
  emptyCategoryCount: 0,
  sourceAssetCount: 8,
});

function isPositiveInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// A category holds items either directly (`items: [...]`) or nested one
// level under named groups (`groups: [{ name, items: [...] }, ...]`, e.g.
// "Steaks" splits into "Chicken"/"Beef" groups). Both shapes are real and
// must be walked — treating only the flat shape as authoritative previously
// produced a false "empty category" finding for every grouped category.
export function collectCategoryItems(category) {
  const collected = [];
  for (const item of Array.isArray(category?.items) ? category.items : []) {
    collected.push({ item, group: null });
  }
  for (const group of Array.isArray(category?.groups) ? category.groups : []) {
    for (const item of Array.isArray(group?.items) ? group.items : []) {
      collected.push({ item, group: group?.name ?? '(unnamed group)' });
    }
  }
  return collected;
}

/**
 * Compares a validateMenu() summary against VERIFIED_MENU_BASELINE and
 * returns an error string per drifted field. Any drift — up or down — is
 * reported; this function never decides whether drift is "good" or "bad",
 * only that it happened and needs deliberate human review.
 */
export function compareToVerifiedBaseline(summary, baseline = VERIFIED_MENU_BASELINE) {
  const errors = [];
  const actual = {
    totalItems: summary.totalItems,
    categoryCount: summary.categoryCount,
    singlePrice: summary.singlePrice,
    variantPrice: summary.variantPrice,
    missingPrice: summary.missingPrice,
    emptyCategoryCount: Array.isArray(summary.emptyCategories) ? summary.emptyCategories.length : null,
    sourceAssetCount: summary.sourceAssetCount,
  };
  for (const key of Object.keys(baseline)) {
    const value = actual[key];
    if (value === null || value === undefined) continue; // already reported by a structural error elsewhere
    if (value !== baseline[key]) {
      errors.push(
        `Menu total drifted from the Step 3 verified baseline: ${key} is ${value}, expected ${baseline[key]}. If this is a deliberate, owner-confirmed source-data change, update VERIFIED_MENU_BASELINE in validators/menu.mjs by hand after re-verifying, and record it in .continuum/DECISIONS.md — do not silently widen the baseline to match.`
      );
    }
  }
  return errors;
}

/**
 * Validates menu.json structure, integer-PKR price shapes, and duplicate
 * item names. Never mutates the input and never invents missing items —
 * empty categories are reported, not filled in.
 */
export function validateMenu(menu) {
  const errors = [];
  const warnings = [];
  const info = [];

  for (const key of ['currency', 'status', 'pricing_notice', 'source_assets', 'categories']) {
    if (!(key in menu)) errors.push(`Missing top-level key "${key}".`);
  }

  if (menu.currency !== EXPECTED_CURRENCY) {
    errors.push(`currency is ${JSON.stringify(menu.currency)}, expected ${JSON.stringify(EXPECTED_CURRENCY)}.`);
  }

  let sourceAssetCount = null;
  if (!Array.isArray(menu.source_assets)) {
    errors.push('source_assets is not an array.');
  } else {
    sourceAssetCount = menu.source_assets.length;
  }

  const categories = Array.isArray(menu.categories) ? menu.categories : [];
  if (!Array.isArray(menu.categories)) errors.push('categories is not an array.');

  let totalItems = 0;
  let singlePrice = 0;
  let variantPrice = 0;
  let missingPrice = 0;
  const emptyCategories = [];
  const categorySummaries = [];
  const globalNameLocations = new Map();

  for (const category of categories) {
    const categoryName = category?.name ?? '(unnamed category)';
    const hasFlatItems = Array.isArray(category?.items);
    const hasGroups = Array.isArray(category?.groups);
    if (!hasFlatItems && !hasGroups) {
      errors.push(`Category "${categoryName}" has neither an items array nor a groups array.`);
    }
    const entries = collectCategoryItems(category);
    if (entries.length === 0) emptyCategories.push(categoryName);

    const seenInCategory = new Set();
    for (const { item, group } of entries) {
      totalItems++;
      const itemName = item?.name ?? '(unnamed item)';
      const location = group ? `${categoryName} > ${group}` : categoryName;

      if (seenInCategory.has(itemName)) {
        errors.push(`Duplicate item name "${itemName}" within category "${categoryName}".`);
      }
      seenInCategory.add(itemName);

      if (!globalNameLocations.has(itemName)) globalNameLocations.set(itemName, []);
      globalNameLocations.get(itemName).push(categoryName);

      const hasSingle = item?.price_pkr !== undefined;
      const hasVariant = item?.prices_pkr !== undefined;

      if (hasSingle && hasVariant) {
        errors.push(`Item "${itemName}" in "${location}" has both price_pkr and prices_pkr — exactly one is allowed.`);
      } else if (hasSingle) {
        if (!isPositiveInteger(item.price_pkr)) {
          errors.push(`Item "${itemName}" in "${location}" has a non-integer/non-positive price_pkr: ${JSON.stringify(item.price_pkr)}.`);
        } else {
          singlePrice++;
        }
      } else if (hasVariant) {
        const variants = item.prices_pkr;
        const keys = variants && typeof variants === 'object' ? Object.keys(variants) : [];
        if (keys.length === 0) {
          errors.push(`Item "${itemName}" in "${location}" has an empty prices_pkr object.`);
        } else {
          variantPrice++;
          for (const variantKey of keys) {
            if (!isPositiveInteger(variants[variantKey])) {
              errors.push(
                `Item "${itemName}" in "${location}" variant "${variantKey}" has a non-integer/non-positive price: ${JSON.stringify(variants[variantKey])}.`
              );
            }
          }
        }
      } else {
        missingPrice++;
        errors.push(`Item "${itemName}" in "${location}" has neither price_pkr nor prices_pkr.`);
      }
    }

    categorySummaries.push({ name: categoryName, itemCount: entries.length, groups: (category?.groups ?? []).map((g) => g?.name).filter(Boolean) });
  }

  for (const [name, locations] of globalNameLocations) {
    const uniqueLocations = [...new Set(locations)];
    if (uniqueLocations.length > 1) {
      warnings.push(`Item name "${name}" appears in multiple categories: ${uniqueLocations.join(', ')} — confirm this is intentional, not a transcription split.`);
    }
  }

  const sortedEmpty = [...emptyCategories].sort();
  if (sortedEmpty.length > 0) {
    warnings.push(
      `${sortedEmpty.length} categor${sortedEmpty.length === 1 ? 'y has' : 'ies have'} zero items (checked both the flat "items" and nested "groups[].items" shapes): ${sortedEmpty.join(', ')} — treat as a Gate 2 source-image/owner reconciliation issue, do not fill in items.`
    );
  } else {
    info.push('No empty categories found (checked both the flat "items" and nested "groups[].items" shapes).');
  }

  info.push('Source items carry no stable "id" field yet — this is expected; stable IDs are assigned at import per data-model-v2.md, not before.');

  return {
    errors,
    warnings,
    info,
    summary: {
      totalItems,
      singlePrice,
      variantPrice,
      missingPrice,
      categoryCount: categories.length,
      emptyCategories: sortedEmpty,
      categorySummaries,
      sourceAssetCount,
    },
  };
}
