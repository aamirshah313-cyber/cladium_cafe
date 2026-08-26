/**
 * Published menu view — Runbook Step 17.
 *
 * The guest-facing shape a repository would eventually return (Step 19+):
 * categories → items → variants, tri-state availability, integer PKR. This
 * is deliberately its own type, not `adapter.ts`'s `NormalizedMenuImport`
 * or `import-plan.ts`'s planned-row types — those describe a *draft import
 * plan* for a database write, not something safe to show a guest.
 *
 * `getPublishedMenuView` always returns `UNPUBLISHED` today: no menu has
 * been imported or published (Step 11's own evidence note), and
 * `operations/release-gates-v2.md` Gate 0/Gate 2 are explicit — "The owner
 * has approved the transcribed menu names, variants, and prices" and "The
 * public menu reads only the owner-approved published version" — neither
 * of which has happened (see the outstanding items in
 * `cladium-research/data/validation/owner-signoff-report.md`). This
 * function is the one seam a future Step 19 repository replaces; nothing
 * else in the menu-browsing UI needs to change when it does.
 */

import type { AvailabilityStatus } from '../../lib/schemas/common';

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

/** The one seam Step 19's repository replaces. See module doc comment. */
export function getPublishedMenuView(): PublishedMenuView {
  return { status: 'UNPUBLISHED' };
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
