/**
 * Published menu view — Runbook Step 17/19.
 *
 * The guest-facing shape a repository returns: categories → items →
 * variants, tri-state availability, integer PKR. This is deliberately its
 * own type, not `adapter.ts`'s `NormalizedMenuImport` or `import-plan.ts`'s
 * planned-row types — those describe a *draft import plan* for a database
 * write, not something safe to show a guest.
 *
 * `getPublishedMenuView` reads real Postgres rows via
 * `guest-view-repository.ts#fetchPublishedMenuView`, through an anon-key
 * client (`supabase-public-client.ts`) — never the service-role client
 * `admin-service.ts` uses. RLS (`menu_versions_public_read`/
 * `menu_categories_public_read`/etc., `20260824140002_rls_policies.sql`)
 * is the actual security boundary enforcing
 * `operations/release-gates-v2.md` Gate 2's "the public menu reads only
 * the owner-approved published version": a draft or approved-but-
 * unpublished version's rows are physically absent from any query this
 * function's client can construct, not merely filtered by convention.
 * Whether the owner has actually approved/published real content (Gate 0)
 * is a separate, later business decision this function does not make —
 * with zero published versions, this correctly still returns
 * `UNPUBLISHED`.
 */

import { assertServerOnly } from '../../lib/server-only';
import type { AvailabilityStatus } from '../../lib/schemas/common';
import { createSupabasePublicClient } from '../integrations/supabase-public-client';
import { fetchPublishedMenuView } from './guest-view-repository';

assertServerOnly('src/modules/menu/menu-view.ts');

export type { AvailabilityStatus };

export interface MenuViewVariant {
  readonly id: string;
  readonly label: string;
  readonly pricePkr: number;
}

export interface MenuViewItem {
  readonly id: string;
  readonly name: string;
  readonly groupLabel: string | null;
  readonly availability: AvailabilityStatus;
  /** `null` when the item is variant-priced — see `variants` instead. */
  readonly basePricePkr: number | null;
  readonly variants: readonly MenuViewVariant[];
  readonly isSignature: boolean;
  readonly serves: string | null;
  readonly servedWith: string | null;
}

export interface MenuViewCategory {
  readonly id: string;
  readonly name: string;
  readonly items: readonly MenuViewItem[];
}

export type PublishedMenuView =
  | { readonly status: 'UNPUBLISHED' }
  | {
      readonly status: 'PUBLISHED';
      readonly versionNumber: number;
      readonly categories: readonly MenuViewCategory[];
    };

/** The one seam every consumer (guest page, takeaway/cart, concierge) shares. See module doc comment. */
export async function getPublishedMenuView(): Promise<PublishedMenuView> {
  return fetchPublishedMenuView({ client: createSupabasePublicClient() });
}

export interface MenuFilterInput {
  /** Case-insensitive substring match against item name and group label. */
  readonly query?: string;
  readonly categoryId?: string;
}

/**
 * Filters categories/items for search and category selection. Categories
 * left with zero matching items are dropped rather than shown empty.
 */
export function filterMenuCategories(
  categories: readonly MenuViewCategory[],
  filter: MenuFilterInput,
): readonly MenuViewCategory[] {
  const query = filter.query?.trim().toLowerCase();

  return categories
    .filter((category) => !filter.categoryId || category.id === filter.categoryId)
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          (item.groupLabel?.toLowerCase().includes(query) ?? false)
        );
      }),
    }))
    .filter((category) => category.items.length > 0);
}
