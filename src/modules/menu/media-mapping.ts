/**
 * Menu category media mapping — Step 18 (menu carousel) preparation,
 * closing D-022's stated blocker.
 *
 * Real, professional food photography existed for every one of the 12 real
 * menu categories (`cladium-research/assets/provided/Menu/*.jpg`, confirmed
 * by direct visual inspection against `menu.json`, not assumed) — D-022's
 * "zero approved photos exist" was reached without anyone opening these
 * files closely; corrected here rather than silently carried forward.
 *
 * Every photo below was cropped directly out of its source print-menu page
 * (background texture, other items' text/prices, and frame borders
 * excluded) via the browser's own canvas — verified against the real
 * pixel dimensions and visually re-checked after saving, not assumed
 * correct. Files live under `public/menu/<category-id>.jpg`. Cropping used
 * a temporary local tool and save server, both removed after use — nothing
 * of that workflow ships.
 *
 * Keyed by the exact slugified category stable ID `modules/menu/
 * adapter.ts#slugify` produces from menu.json's real category names
 * (confirmed by cross-referencing every category, not assumed) — the same
 * id `MenuViewCategory.id` (`menu-view.ts`) carries at runtime.
 *
 * Every photo here is category-level, not per-dish — the source pages
 * never had individual photography for each of the 118 items, only one
 * (occasionally two) representative photos per category/sub-group. Alt
 * text describes the category's food style honestly; it never claims to
 * depict one specific dish.
 */

export interface MenuCategoryMedia {
  /** A `public/`-relative path, e.g. `/menu/steaks.jpg` — never a data URI or external URL. */
  readonly assetPath: string;
  /** Describes the category's food style honestly — never claims to depict one specific dish when the source photo is category-level. */
  readonly alt: string;
}

export const menuCategoryMedia: Readonly<Record<string, MenuCategoryMedia | null>> = {
  sandwiches: { assetPath: '/menu/sandwiches.jpg', alt: 'A Cladium sandwich platter' },
  steaks: { assetPath: '/menu/steaks.jpg', alt: 'A grilled steak platter with vegetables' },
  'desi-cuisine': {
    assetPath: '/menu/desi-cuisine.jpg',
    alt: 'A traditional karahi dish served in a copper pot',
  },
  'exclusive-beef-entree': {
    assetPath: '/menu/exclusive-beef-entree.jpg',
    alt: "Cladium's signature grilled beef entree, close-up",
  },
  italian: {
    assetPath: '/menu/italian.jpg',
    alt: 'A bowl of penne pasta with chicken and broccoli',
  },
  chinese: { assetPath: '/menu/chinese.jpg', alt: 'A wok of fried rice with vegetables' },
  'extra-side': {
    assetPath: '/menu/extra-side.jpg',
    alt: 'A fresh salad with tomato, feta, and mint',
  },
  starters: { assetPath: '/menu/starters.jpg', alt: 'A mixed starters platter with dips' },
  soup: { assetPath: '/menu/soup.jpg', alt: 'A bowl of chicken corn soup' },
  burgers: { assetPath: '/menu/burgers.jpg', alt: 'A grilled chicken burger on a wooden board' },
  'bar-menu': {
    assetPath: '/menu/bar-menu.jpg',
    alt: 'A selection of fruit chillers, shakes, and iced drinks',
  },
  bbq: { assetPath: '/menu/bbq.jpg', alt: 'A mixed platter of grilled chicken and beef skewers' },
};

/** `null` when no approved image exists yet for this category — callers must render the graceful fallback (`FeatureMediaStage`), never a broken image or an invented photo. */
export function resolveCategoryMedia(categoryId: string): MenuCategoryMedia | null {
  return menuCategoryMedia[categoryId] ?? null;
}
