/**
 * `getMenu` read tool — Runbook Step 26 (`agent/tool-contracts.md`).
 *
 * Reads exclusively from `getPublishedMenuView()` — the same seam
 * `app/[locale]/menu/page.tsx` reads, so the concierge can never see a
 * different, unapproved, or draft menu than the guest-facing page shows.
 * "Never expose unavailable/draft items": a *draft* item is already
 * structurally impossible here (`getPublishedMenuView` only ever returns
 * the currently published version, never a draft one — D-021); an
 * *unavailable* published item is still returned with its tri-state
 * `availability`, matching `menu/page.tsx`'s own precedent of showing
 * `UNAVAILABLE` honestly rather than hiding it.
 */

import {
  filterMenuCategories,
  getPublishedMenuView,
  type MenuViewItem,
  type PublishedMenuView,
} from '../../menu/menu-view';
import type { GetMenuInput } from '../schemas';

export type GetMenuResult =
  | { readonly status: 'UNPUBLISHED' }
  | { readonly status: 'ITEM_NOT_FOUND' }
  | {
      readonly status: 'OK';
      readonly versionNumber: number;
      readonly categories: readonly {
        readonly id: string;
        readonly name: string;
        readonly items: readonly MenuViewItem[];
      }[];
    }
  | { readonly status: 'OK_ITEM'; readonly item: MenuViewItem };

/** `getMenuView` defaults to the real seam; tests inject a fixture, same pattern as `modules/takeaway/deps.ts`. */
export function getMenu(
  input: GetMenuInput,
  getMenuView: () => PublishedMenuView = getPublishedMenuView,
): GetMenuResult {
  const menuView = getMenuView();
  if (menuView.status === 'UNPUBLISHED') return { status: 'UNPUBLISHED' };

  if (input.itemId) {
    for (const category of menuView.categories) {
      const item = category.items.find((candidate) => candidate.id === input.itemId);
      if (item) return { status: 'OK_ITEM', item };
    }
    return { status: 'ITEM_NOT_FOUND' };
  }

  const categories = filterMenuCategories(menuView.categories, {
    query: input.query,
    categoryId: input.category,
  });

  return { status: 'OK', versionNumber: menuView.versionNumber, categories };
}
