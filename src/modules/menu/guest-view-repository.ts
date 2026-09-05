/**
 * Guest-facing published-menu read side — Step 19.
 *
 * Reconstructs a `PublishedMenuView` (`menu-view.ts`) from real Postgres
 * rows via an anon-key client — RLS (`menu_versions_public_read`/
 * `menu_categories_public_read`/`menu_items_public_read`/
 * `menu_variants_public_read`, `20260824140002_rls_policies.sql`) is the
 * actual security boundary: `published_at is not null` /
 * `publish_state = 'PUBLISHED'`. `deps.client` must always be an anon-key
 * client (`supabase-public-client.ts`) — a service-role client here would
 * silently bypass RLS and could leak draft content.
 *
 * The `.eq('publish_state', 'PUBLISHED')` filters below are redundant with
 * RLS (a draft/archived row is already absent from any result this client
 * can get back) but kept anyway as defense-in-depth and to make each
 * query's intent self-documenting, matching `admin-service.ts`'s own
 * conventions (row interfaces, `.returns<T[]>()`, throw on unexpected
 * Supabase errors — these are infrastructure failures, not domain
 * outcomes, so no `Result` wrapper here; `PublishedMenuView`'s own
 * `UNPUBLISHED`/`PUBLISHED` union is already the expected-outcomes shape).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../../lib/server-only';
import type { AvailabilityStatus } from '../../lib/schemas/common';
import type {
  MenuViewCategory,
  MenuViewItem,
  MenuViewVariant,
  PublishedMenuView,
} from './menu-view';

assertServerOnly('src/modules/menu/guest-view-repository.ts');

export interface GuestMenuViewDeps {
  readonly client: SupabaseClient;
}

interface PublishedVersionRow {
  readonly id: string;
  readonly version_number: number;
}

interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly sort_order: number;
}

interface ItemRow {
  readonly id: string;
  readonly category_id: string;
  readonly name: string;
  readonly group_label: string | null;
  readonly base_price_pkr: number | null;
  readonly availability: AvailabilityStatus;
  readonly is_signature: boolean;
  readonly serves: string | null;
  readonly served_with: string | null;
  readonly sort_order: number;
}

interface VariantRow {
  readonly id: string;
  readonly item_id: string;
  readonly label: string;
  readonly price_pkr: number;
  readonly sort_order: number;
}

export async function fetchPublishedMenuView(deps: GuestMenuViewDeps): Promise<PublishedMenuView> {
  const { client } = deps;

  const { data: versionRow, error: versionError } = await client
    .from('menu_versions')
    .select('id, version_number')
    .not('published_at', 'is', null)
    .maybeSingle<PublishedVersionRow>();
  if (versionError) {
    throw new Error(`published menu version lookup failed: ${versionError.code ?? 'unknown'}`);
  }
  if (!versionRow) return { status: 'UNPUBLISHED' };

  const { data: categoryRows, error: categoryError } = await client
    .from('menu_categories')
    .select('id, name, sort_order')
    .eq('menu_version_id', versionRow.id)
    .eq('publish_state', 'PUBLISHED')
    .order('sort_order', { ascending: true })
    .returns<CategoryRow[]>();
  if (categoryError) {
    throw new Error(`published menu categories lookup failed: ${categoryError.code ?? 'unknown'}`);
  }

  const { data: itemRows, error: itemError } = await client
    .from('menu_items')
    .select(
      'id, category_id, name, group_label, base_price_pkr, availability, is_signature, serves, served_with, sort_order',
    )
    .eq('menu_version_id', versionRow.id)
    .eq('publish_state', 'PUBLISHED')
    .order('sort_order', { ascending: true })
    .returns<ItemRow[]>();
  if (itemError) {
    throw new Error(`published menu items lookup failed: ${itemError.code ?? 'unknown'}`);
  }

  const { data: variantRows, error: variantError } = await client
    .from('menu_variants')
    .select('id, item_id, label, price_pkr, sort_order')
    .eq('menu_version_id', versionRow.id)
    .eq('publish_state', 'PUBLISHED')
    .order('sort_order', { ascending: true })
    .returns<VariantRow[]>();
  if (variantError) {
    throw new Error(`published menu variants lookup failed: ${variantError.code ?? 'unknown'}`);
  }

  const variantsByItemId = new Map<string, MenuViewVariant[]>();
  for (const v of variantRows ?? []) {
    const list = variantsByItemId.get(v.item_id) ?? [];
    list.push({ id: v.id, label: v.label, pricePkr: v.price_pkr });
    variantsByItemId.set(v.item_id, list);
  }

  const itemsByCategoryId = new Map<string, MenuViewItem[]>();
  for (const i of itemRows ?? []) {
    const list = itemsByCategoryId.get(i.category_id) ?? [];
    list.push({
      id: i.id,
      name: i.name,
      groupLabel: i.group_label,
      availability: i.availability,
      basePricePkr: i.base_price_pkr,
      variants: variantsByItemId.get(i.id) ?? [],
      isSignature: i.is_signature,
      serves: i.serves,
      servedWith: i.served_with,
    });
    itemsByCategoryId.set(i.category_id, list);
  }

  const categories: MenuViewCategory[] = (categoryRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    items: itemsByCategoryId.get(c.id) ?? [],
  }));

  return { status: 'PUBLISHED', versionNumber: versionRow.version_number, categories };
}
