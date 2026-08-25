/**
 * Runbook Step 11 — typed menu import adapter.
 *
 * Normalizes `cladium-research/data/menu.json` (source evidence, never
 * rewritten) into the shape `menu_versions`/`menu_categories`/`menu_items`/
 * `menu_variants` expect: stable IDs, a source checksum for idempotent
 * re-import, and integer PKR prices. It never assigns availability other
 * than UNKNOWN and never invents a translation — Urdu text is a separate,
 * owner-reviewed workflow against the `translations` table.
 *
 * Source-content quality (duplicate names, empty categories, price-shape
 * sanity) is already gated by `scripts/validate/validators/menu.mjs`
 * (Step 3, run as `npm run validate:sources`). This adapter assumes that
 * gate has passed and focuses on what only it can do: deriving stable IDs
 * and a checksum, and refusing to normalize a price shape it cannot import.
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import { ok, err, type Result } from '../../lib/result';
import { validationFailed, type AppError, type FieldIssue } from '../../lib/errors';

// -------------------------------------------------------------- source shape
// Mirrors the transcribed shape in cladium-research/data/menu.json exactly.
// Field lengths match the destination column constraints in
// supabase/migrations/20260824120003_menu_content.sql.

const sourceItemSchema = z.object({
  name: z.string().min(1).max(200),
  price_pkr: z.number().int().positive().optional(),
  prices_pkr: z.record(z.string().min(1).max(60), z.number().int().positive()).optional(),
  signature: z.boolean().optional(),
  serves: z.number().int().positive().optional(),
  quantity: z.string().min(1).max(60).optional(),
  served_with: z.string().min(1).max(200).optional(),
});
type SourceItem = z.infer<typeof sourceItemSchema>;

const sourceGroupSchema = z.object({
  name: z.string().min(1).max(120),
  items: z.array(sourceItemSchema),
});

const sourceCategorySchema = z.object({
  name: z.string().min(1).max(120),
  items: z.array(sourceItemSchema).optional(),
  groups: z.array(sourceGroupSchema).optional(),
  // Category-level free-text note (e.g. Chinese: "single"). No destination
  // column exists for it; surfaced via `unmappedFields` instead of dropped.
  serving: z.string().optional(),
});

const sourceMenuSchema = z.object({
  currency: z.literal('PKR'),
  status: z.string(),
  pricing_notice: z.string(),
  source_assets: z.array(z.string().min(1)),
  categories: z.array(sourceCategorySchema).min(1),
});

export type SourceMenu = z.infer<typeof sourceMenuSchema>;

// ---------------------------------------------------------- normalized shape

export interface NormalizedMenuCategory {
  readonly stableId: string;
  readonly name: string;
  readonly sortOrder: number;
}

export interface NormalizedMenuItem {
  readonly stableId: string;
  readonly categoryStableId: string;
  /** e.g. "Chicken"/"Beef" under Steaks/Burgers/BBQ, or null when ungrouped. */
  readonly groupLabel: string | null;
  readonly name: string;
  /** Null when the item is variant-priced (see variants instead). */
  readonly basePricePkr: number | null;
  readonly isSignature: boolean;
  readonly serves: string | null;
  readonly quantityLabel: string | null;
  readonly servedWith: string | null;
  readonly sortOrder: number;
}

export interface NormalizedMenuVariant {
  readonly stableId: string;
  readonly itemStableId: string;
  readonly label: string;
  readonly pricePkr: number;
  readonly sortOrder: number;
}

export interface UnmappedSourceField {
  readonly path: string;
  readonly note: string;
}

export interface NormalizedMenuImport {
  readonly sourceChecksum: string;
  readonly sourceReferences: readonly string[];
  readonly categories: readonly NormalizedMenuCategory[];
  readonly items: readonly NormalizedMenuItem[];
  readonly variants: readonly NormalizedMenuVariant[];
  readonly unmappedFields: readonly UnmappedSourceField[];
  readonly summary: {
    readonly categoryCount: number;
    readonly itemCount: number;
    readonly variantCount: number;
    readonly singlePriceItemCount: number;
    readonly variantPriceItemCount: number;
  };
}

// ------------------------------------------------------------------- slugify

/** Stable IDs must match `^[a-z0-9][a-z0-9._-]*$` (see menu_items_stable_id_format etc). */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'item';
}

/** Appends -2, -3, ... on collision so every stable ID in a version is unique. */
function dedupe(base: string, seen: Set<string>): string {
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }
  let suffix = 2;
  while (seen.has(`${base}-${suffix}`)) suffix++;
  const id = `${base}-${suffix}`;
  seen.add(id);
  return id;
}

interface FlattenedEntry {
  readonly item: SourceItem;
  readonly group: string | null;
}

function flattenCategoryItems(category: z.infer<typeof sourceCategorySchema>): FlattenedEntry[] {
  const flat = (category.items ?? []).map((item) => ({ item, group: null }));
  const grouped = (category.groups ?? []).flatMap((group) =>
    group.items.map((item) => ({ item, group: group.name })),
  );
  return [...flat, ...grouped];
}

// --------------------------------------------------------------- normalizer

/**
 * Parses and normalizes the raw menu.json text. Returns Err on structural
 * problems (bad JSON, schema mismatch, an item with neither or both price
 * shapes) rather than importing a partial or guessed record.
 */
export function normalizeMenuSource(rawJsonText: string): Result<NormalizedMenuImport, AppError> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJsonText);
  } catch {
    return err(validationFailed([{ path: '', code: 'invalid_json' }]));
  }

  const parsed = sourceMenuSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issues: FieldIssue[] = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code,
    }));
    return err(validationFailed(issues));
  }
  const menu = parsed.data;

  const sourceChecksum = crypto.createHash('sha256').update(rawJsonText, 'utf8').digest('hex');

  const categorySlugs = new Set<string>();
  const itemSlugs = new Set<string>();
  const variantSlugs = new Set<string>();

  const categories: NormalizedMenuCategory[] = [];
  const items: NormalizedMenuItem[] = [];
  const variants: NormalizedMenuVariant[] = [];
  const unmappedFields: UnmappedSourceField[] = [];
  const issues: FieldIssue[] = [];

  let singlePriceItemCount = 0;
  let variantPriceItemCount = 0;

  menu.categories.forEach((category, categoryIndex) => {
    const categoryStableId = dedupe(slugify(category.name), categorySlugs);
    categories.push({ stableId: categoryStableId, name: category.name, sortOrder: categoryIndex });

    if (category.serving !== undefined) {
      unmappedFields.push({
        path: `categories[${categoryIndex}].serving`,
        note: `Category-level "serving" note ("${category.serving}") has no destination column and is not imported. Preserved only in source JSON.`,
      });
    }

    flattenCategoryItems(category).forEach(({ item, group }, itemIndex) => {
      const groupSlug = group ? slugify(group) : null;
      const baseSlug = groupSlug
        ? `${categoryStableId}.${groupSlug}.${slugify(item.name)}`
        : `${categoryStableId}.${slugify(item.name)}`;
      const itemStableId = dedupe(baseSlug, itemSlugs);

      const hasSingle = item.price_pkr !== undefined;
      const hasVariant = item.prices_pkr !== undefined;

      if (hasSingle === hasVariant) {
        issues.push({
          path: `${itemStableId}.price`,
          code: 'exactly_one_price_shape_required',
        });
        return;
      }

      items.push({
        stableId: itemStableId,
        categoryStableId,
        groupLabel: group,
        name: item.name,
        basePricePkr: hasSingle ? (item.price_pkr as number) : null,
        isSignature: item.signature ?? false,
        serves: item.serves !== undefined ? String(item.serves) : null,
        quantityLabel: item.quantity ?? null,
        servedWith: item.served_with ?? null,
        sortOrder: itemIndex,
      });

      if (hasSingle) {
        singlePriceItemCount++;
      } else {
        variantPriceItemCount++;
        Object.entries(item.prices_pkr as Record<string, number>).forEach(
          ([label, price], variantIndex) => {
            const variantStableId = dedupe(`${itemStableId}.${slugify(label)}`, variantSlugs);
            variants.push({
              stableId: variantStableId,
              itemStableId,
              label,
              pricePkr: price,
              sortOrder: variantIndex,
            });
          },
        );
      }
    });
  });

  if (issues.length > 0) {
    return err(validationFailed(issues));
  }

  return ok({
    sourceChecksum,
    sourceReferences: menu.source_assets,
    categories,
    items,
    variants,
    unmappedFields,
    summary: {
      categoryCount: categories.length,
      itemCount: items.length,
      variantCount: variants.length,
      singlePriceItemCount,
      variantPriceItemCount,
    },
  });
}
