/**
 * Staff menu review/publish service. Executes, for real, the plans
 * `import-plan.ts`, `publish-plan.ts`, and `diff-report.ts` have computed
 * since Step 11 with no database connection of their own — see
 * `supabase/migrations/20260905010000_menu_import_publish_functions.sql`'s
 * `menu_import_draft`/`menu_publish_version`, the two multi-table
 * transactional writes PostgREST cannot express.
 *
 * Every mutating action is `OWNER`/`MANAGER`-only (`MENU_STAFF_ROLES`,
 * `deps.ts`) and logs a `MENU_PUBLISHING` audit event — the category
 * exists in `AuditEventCategory` for exactly this.
 *
 * `menu.json` is read via a build-time static `import`, not a runtime
 * `fs.readFileSync` — `resolveJsonModule` is enabled in `tsconfig.json`, so
 * the content is embedded in the compiled bundle with no Vercel
 * file-tracing question to reason about. `normalizeMenuSource` needs the
 * raw JSON *text*, not a parsed object, and only to compute a stable
 * checksum from whatever string it is given (`sha256(rawJsonText)`) — a
 * static import already gives a parsed object, so `JSON.stringify` on it
 * is what is hashed. That will not match a checksum computed from the raw
 * file bytes elsewhere (`scripts/validate/validators/menu.mjs` reads the
 * file directly), but nothing needs it to: this module's checksum only
 * has to be stable against itself, for its own "was this already
 * imported" idempotency check, which `JSON.stringify` of a given parsed
 * object deterministically is.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import menuJson from '../../../cladium-research/data/menu.json';
import { assertServerOnly } from '../../lib/server-only';
import { ok, err, type Result } from '../../lib/result';
import { conflict, forbidden, notFound, validationFailed, type AppError } from '../../lib/errors';
import { hasAnyRole, type Actor } from '../../lib/domain/actor';
import { buildAuditEvent } from '../../lib/domain/audit-event';
import { createPostgresAuditEventSink } from '../../lib/db/postgres-event-sinks';
import {
  normalizeMenuSource,
  type NormalizedMenuCategory,
  type NormalizedMenuImport,
  type NormalizedMenuItem,
  type NormalizedMenuVariant,
} from './adapter';
import { buildMenuImportPlan, type ExistingMenuVersionRef } from './import-plan';
import { buildMenuDiffReport, type MenuDiffReport } from './diff-report';
import { buildMenuPublishPlan } from './publish-plan';
import { resolveCategoryMedia, type MenuCategoryMedia } from './media-mapping';
import { MENU_STAFF_ROLES } from './deps';

assertServerOnly('src/modules/menu/admin-service.ts');

export interface MenuAdminDeps {
  readonly client: SupabaseClient;
}

export type MenuReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export interface MenuVersionSummary {
  readonly versionNumber: number;
  readonly version: number;
  readonly sourceChecksum: string;
  readonly importedAt: string;
  readonly reviewStatus: MenuReviewStatus;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly publishedAt: string | null;
}

interface MenuVersionRow {
  readonly id: string;
  readonly version_number: number;
  readonly version: number;
  readonly source_checksum: string;
  readonly imported_at: string;
  readonly review_status: MenuReviewStatus;
  readonly approved_by: string | null;
  readonly approved_at: string | null;
  readonly published_at: string | null;
}

/** Postgres renders `timestamptz` as `+00:00`; the domain always uses `toISOString()`'s `.000Z`. See D-064. */
function iso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function toSummary(row: MenuVersionRow): MenuVersionSummary {
  return {
    versionNumber: row.version_number,
    version: row.version,
    sourceChecksum: row.source_checksum,
    importedAt: new Date(row.imported_at).toISOString(),
    reviewStatus: row.review_status,
    approvedBy: row.approved_by,
    approvedAt: iso(row.approved_at),
    publishedAt: iso(row.published_at),
  };
}

export async function listMenuVersions(
  deps: MenuAdminDeps,
): Promise<Result<readonly MenuVersionSummary[], AppError>> {
  const { data, error } = await deps.client
    .from('menu_versions')
    .select(
      'id, version_number, version, source_checksum, imported_at, review_status, approved_by, approved_at, published_at',
    )
    .order('version_number', { ascending: false })
    .returns<MenuVersionRow[]>();
  if (error) {
    throw new Error(`menu version list failed: ${error.code ?? 'unknown'}`);
  }
  return ok((data ?? []).map(toSummary));
}

interface CategoryRow {
  readonly id: string;
  readonly stable_id: string;
  readonly name: string;
  readonly sort_order: number;
}

interface ItemRow {
  readonly id: string;
  readonly category_id: string;
  readonly stable_id: string;
  readonly name: string;
  readonly group_label: string | null;
  readonly base_price_pkr: number | null;
  readonly is_signature: boolean;
  readonly serves: string | null;
  readonly quantity_label: string | null;
  readonly served_with: string | null;
  readonly sort_order: number;
}

interface VariantRow {
  readonly item_id: string;
  readonly stable_id: string;
  readonly label: string;
  readonly price_pkr: number;
  readonly sort_order: number;
}

/**
 * Reconstructs the `NormalizedMenuImport` shape `diff-report.ts` needs from
 * real rows — the DB stores parent references as uuids
 * (`category_id`/`item_id`), while the shape `buildMenuDiffReport` compares
 * by stable id, so this resolves back the other direction from the same
 * `import-plan.ts` used to insert them. `unmappedFields` has no DB
 * equivalent (a Step-11-only, import-time-only concept) and is always
 * empty here; nothing downstream reads it.
 */
function toNormalizedImport(
  sourceChecksum: string,
  categories: readonly CategoryRow[],
  items: readonly ItemRow[],
  variants: readonly VariantRow[],
): NormalizedMenuImport {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.stable_id]));
  const itemStableIdById = new Map(items.map((i) => [i.id, i.stable_id]));

  const normalizedCategories: NormalizedMenuCategory[] = categories.map((c) => ({
    stableId: c.stable_id,
    name: c.name,
    sortOrder: c.sort_order,
  }));

  const normalizedItems: NormalizedMenuItem[] = items.map((i) => ({
    stableId: i.stable_id,
    categoryStableId: categoryNameById.get(i.category_id) ?? '',
    groupLabel: i.group_label,
    name: i.name,
    basePricePkr: i.base_price_pkr,
    isSignature: i.is_signature,
    serves: i.serves,
    quantityLabel: i.quantity_label,
    servedWith: i.served_with,
    sortOrder: i.sort_order,
  }));

  const normalizedVariants: NormalizedMenuVariant[] = variants.map((v) => ({
    stableId: v.stable_id,
    itemStableId: itemStableIdById.get(v.item_id) ?? '',
    label: v.label,
    pricePkr: v.price_pkr,
    sortOrder: v.sort_order,
  }));

  return {
    sourceChecksum,
    sourceReferences: [],
    categories: normalizedCategories,
    items: normalizedItems,
    variants: normalizedVariants,
    unmappedFields: [],
    summary: {
      categoryCount: normalizedCategories.length,
      itemCount: normalizedItems.length,
      variantCount: normalizedVariants.length,
      singlePriceItemCount: normalizedItems.filter((i) => i.basePricePkr !== null).length,
      variantPriceItemCount: normalizedItems.filter((i) => i.basePricePkr === null).length,
    },
  };
}

async function fetchVersionContent(
  client: SupabaseClient,
  versionNumber: number,
): Promise<{
  readonly row: MenuVersionRow;
  readonly categories: readonly CategoryRow[];
  readonly items: readonly ItemRow[];
  readonly variants: readonly VariantRow[];
} | null> {
  const { data: row, error: rowError } = await client
    .from('menu_versions')
    .select(
      'id, version_number, version, source_checksum, imported_at, review_status, approved_by, approved_at, published_at',
    )
    .eq('version_number', versionNumber)
    .maybeSingle<MenuVersionRow>();
  if (rowError) throw new Error(`menu version lookup failed: ${rowError.code ?? 'unknown'}`);
  if (!row) return null;

  // `menu_categories`/`menu_items`/`menu_variants` key on `menu_version_id`
  // (a uuid) — `row.id`, already fetched above, not a second round trip.
  const { data: categories, error: catError } = await client
    .from('menu_categories')
    .select('id, stable_id, name, sort_order')
    .eq('menu_version_id', row.id)
    .order('sort_order', { ascending: true })
    .returns<CategoryRow[]>();
  if (catError) throw new Error(`menu categories lookup failed: ${catError.code ?? 'unknown'}`);

  const { data: items, error: itemError } = await client
    .from('menu_items')
    .select(
      'id, category_id, stable_id, name, group_label, base_price_pkr, is_signature, serves, quantity_label, served_with, sort_order',
    )
    .eq('menu_version_id', row.id)
    .order('sort_order', { ascending: true })
    .returns<ItemRow[]>();
  if (itemError) throw new Error(`menu items lookup failed: ${itemError.code ?? 'unknown'}`);

  const { data: variants, error: variantError } = await client
    .from('menu_variants')
    .select('item_id, stable_id, label, price_pkr, sort_order')
    .eq('menu_version_id', row.id)
    .order('sort_order', { ascending: true })
    .returns<VariantRow[]>();
  if (variantError) {
    throw new Error(`menu variants lookup failed: ${variantError.code ?? 'unknown'}`);
  }

  return { row, categories: categories ?? [], items: items ?? [], variants: variants ?? [] };
}

export interface MenuVersionDetail {
  readonly version: MenuVersionSummary;
  readonly categories: readonly NormalizedMenuCategory[];
  readonly items: readonly NormalizedMenuItem[];
  readonly variants: readonly NormalizedMenuVariant[];
  readonly diff: MenuDiffReport;
  readonly photosByCategory: Readonly<Record<string, MenuCategoryMedia | null>>;
}

export async function getMenuVersionDetail(
  deps: MenuAdminDeps,
  versionNumber: number,
  correlationId?: string,
): Promise<Result<MenuVersionDetail, AppError>> {
  const target = await fetchVersionContent(deps.client, versionNumber);
  if (!target) return err(notFound(correlationId));

  const normalized = toNormalizedImport(
    target.row.source_checksum,
    target.categories,
    target.items,
    target.variants,
  );

  // Diff against whatever is currently published, unless the target *is*
  // the published one (or nothing is) — then everything reads as ADDED,
  // which is the honest state for a first-ever review.
  let previous: NormalizedMenuImport | null = null;
  if (target.row.published_at === null) {
    const { data: publishedRow } = await deps.client
      .from('menu_versions')
      .select('version_number')
      .not('published_at', 'is', null)
      .maybeSingle<{ version_number: number }>();
    if (publishedRow && publishedRow.version_number !== versionNumber) {
      const publishedContent = await fetchVersionContent(deps.client, publishedRow.version_number);
      if (publishedContent) {
        previous = toNormalizedImport(
          publishedContent.row.source_checksum,
          publishedContent.categories,
          publishedContent.items,
          publishedContent.variants,
        );
      }
    }
  }

  const photosByCategory: Record<string, MenuCategoryMedia | null> = {};
  for (const category of normalized.categories) {
    photosByCategory[category.stableId] = resolveCategoryMedia(category.stableId);
  }

  return ok({
    version: toSummary(target.row),
    categories: normalized.categories,
    items: normalized.items,
    variants: normalized.variants,
    diff: buildMenuDiffReport(previous, normalized),
    photosByCategory,
  });
}

async function logMenuAudit(
  client: SupabaseClient,
  actor: Actor,
  action: string,
  targetId: string,
  safeDetail: Readonly<Record<string, unknown>> | null,
  correlationId: string,
): Promise<void> {
  await createPostgresAuditEventSink(client).append(
    buildAuditEvent({
      category: 'MENU_PUBLISHING',
      action,
      actor,
      targetType: 'MENU_VERSION',
      targetId,
      safeDetail,
      correlationId,
    }),
  );
}

export interface ImportMenuDraftResult {
  readonly versionNumber: number;
  readonly alreadyImported: boolean;
}

export async function importMenuDraft(
  deps: MenuAdminDeps,
  actor: Actor,
  correlationId: string,
): Promise<Result<ImportMenuDraftResult, AppError>> {
  if (!hasAnyRole(actor, MENU_STAFF_ROLES)) return err(forbidden(correlationId));

  const normalized = normalizeMenuSource(JSON.stringify(menuJson));
  if (!normalized.ok) return normalized;

  const { data: existingRows, error: existingError } = await deps.client
    .from('menu_versions')
    .select('version_number, source_checksum')
    .returns<{ version_number: number; source_checksum: string }[]>();
  if (existingError) {
    throw new Error(`existing menu versions lookup failed: ${existingError.code ?? 'unknown'}`);
  }
  const existingVersions: ExistingMenuVersionRef[] = (existingRows ?? []).map((r) => ({
    versionNumber: r.version_number,
    sourceChecksum: r.source_checksum,
  }));

  const plan = buildMenuImportPlan(normalized.value, existingVersions);
  if (!plan.ok) return plan;

  const { data, error } = await deps.client.rpc('menu_import_draft', {
    p_source_checksum: plan.value.sourceChecksum,
    p_source_references: plan.value.sourceReferences,
    p_categories: plan.value.categories.map((c) => ({
      stable_id: c.stableId,
      name: c.name,
      sort_order: c.sortOrder,
    })),
    p_items: plan.value.items.map((i) => ({
      stable_id: i.stableId,
      category_stable_id: i.categoryStableId,
      group_label: i.groupLabel,
      name: i.name,
      base_price_pkr: i.basePricePkr,
      is_signature: i.isSignature,
      serves: i.serves,
      quantity_label: i.quantityLabel,
      served_with: i.servedWith,
      sort_order: i.sortOrder,
    })),
    p_variants: plan.value.variants.map((v) => ({
      stable_id: v.stableId,
      item_stable_id: v.itemStableId,
      label: v.label,
      price_pkr: v.pricePkr,
      sort_order: v.sortOrder,
    })),
  });
  if (error) {
    throw new Error(`menu import failed: ${error.code ?? 'unknown'}`);
  }
  const resultRow = data as MenuVersionRow;
  const alreadyImported = plan.value.action.kind === 'ALREADY_IMPORTED';

  await logMenuAudit(
    deps.client,
    actor,
    alreadyImported ? 'menu_version.import_no_op' : 'menu_version.imported',
    resultRow.id,
    { versionNumber: resultRow.version_number, ...plan.value.summary },
    correlationId,
  );

  return ok({ versionNumber: resultRow.version_number, alreadyImported });
}

export async function approveMenuVersion(
  deps: MenuAdminDeps,
  actor: Actor,
  versionNumber: number,
  expectedVersion: number,
  correlationId: string,
): Promise<Result<MenuVersionSummary, AppError>> {
  if (!hasAnyRole(actor, MENU_STAFF_ROLES)) return err(forbidden(correlationId));
  if (actor.id === null) return err(forbidden(correlationId));

  const { data: existing, error: existingError } = await deps.client
    .from('menu_versions')
    .select('version_number, version, review_status')
    .eq('version_number', versionNumber)
    .maybeSingle<{ version_number: number; version: number; review_status: MenuReviewStatus }>();
  if (existingError) {
    throw new Error(`menu version lookup failed: ${existingError.code ?? 'unknown'}`);
  }
  if (!existing) return err(notFound(correlationId));
  if (existing.version !== expectedVersion) return err(conflict(correlationId));
  if (existing.review_status !== 'DRAFT') {
    return err(
      validationFailed([{ path: 'reviewStatus', code: 'must_be_draft_to_approve' }], correlationId),
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await deps.client
    .from('menu_versions')
    .update({ review_status: 'APPROVED', approved_by: actor.id, approved_at: now })
    .eq('version_number', versionNumber)
    .eq('version', expectedVersion)
    .select(
      'version_number, version, source_checksum, imported_at, review_status, approved_by, approved_at, published_at',
    )
    .maybeSingle<MenuVersionRow>();
  if (updateError) {
    throw new Error(`menu version approve failed: ${updateError.code ?? 'unknown'}`);
  }
  // The pre-check above already confirmed DRAFT + matching version; a null
  // result here means someone else changed the row in between (a genuine,
  // if narrow, race) rather than any of the conditions already checked.
  if (!updated) return err(conflict(correlationId));

  await logMenuAudit(
    deps.client,
    actor,
    'menu_version.approved',
    updated.id,
    { versionNumber },
    correlationId,
  );

  return ok(toSummary(updated));
}

export async function publishMenuVersion(
  deps: MenuAdminDeps,
  actor: Actor,
  versionNumber: number,
  correlationId: string,
): Promise<Result<MenuVersionSummary, AppError>> {
  if (!hasAnyRole(actor, MENU_STAFF_ROLES)) return err(forbidden(correlationId));

  const { data: existing, error: existingError } = await deps.client
    .from('menu_versions')
    .select('review_status, approved_by, approved_at, published_at')
    .eq('version_number', versionNumber)
    .maybeSingle<{
      review_status: MenuReviewStatus;
      approved_by: string | null;
      approved_at: string | null;
      published_at: string | null;
    }>();
  if (existingError) {
    throw new Error(`menu version lookup failed: ${existingError.code ?? 'unknown'}`);
  }
  if (!existing) return err(notFound(correlationId));

  // Re-runs buildMenuPublishPlan's exact preconditions client-side first,
  // for a fast, specific error before ever calling the database function —
  // menu_publish_version re-checks the same things (with FOR UPDATE
  // locking) as the actual, race-safe source of truth.
  const planCheck = buildMenuPublishPlan(
    {
      versionNumber,
      reviewStatus: existing.review_status,
      approvedBy: existing.approved_by,
      approvedAt: existing.approved_at,
      publishedAt: existing.published_at,
      draftCategoryCount: 0,
      draftItemCount: 0,
      draftVariantCount: 0,
    },
    null,
  );
  if (!planCheck.ok) return planCheck;

  const { data, error } = await deps.client.rpc('menu_publish_version', {
    p_version_number: versionNumber,
  });
  if (error) {
    // Preconditions were just verified above; reaching here almost
    // certainly means another request changed the row in the interim —
    // genuine optimistic-concurrency territory, not a fresh validation
    // failure to re-diagnose from an RPC error string.
    return err(conflict(correlationId));
  }

  const resultRow = data as MenuVersionRow;
  await logMenuAudit(
    deps.client,
    actor,
    'menu_version.published',
    resultRow.id,
    { versionNumber },
    correlationId,
  );

  return ok(toSummary(resultRow));
}
