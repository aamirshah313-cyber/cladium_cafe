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
 * Every photo *from those pages* is category-level, not per-dish — the
 * source pages never had individual photography for each of the 118 items,
 * only one (occasionally two) representative photos per category/sub-group.
 * Their alt text describes the category's food style honestly; it never
 * claims to depict one specific dish.
 *
 * Three tiers now exist, most specific first: `menuItemMedia` (one named
 * dish, from owner-supplied photography — see its own comment for how that
 * identification was established), `menuGroupMedia` (a sub-group such as
 * BBQ's Beef), and `menuCategoryMedia` (the print-page crops below). The
 * carousel resolves in that order, and each step down is a weaker claim,
 * never a false one.
 *
 * ## Intrinsic dimensions are recorded, and they are small
 *
 * Each entry carries the file's real pixel size, measured from the file
 * rather than assumed. They range from 176x201 to 882x144 — these are
 * crops out of a printed menu page, and that is all the resolution that
 * exists. Recording the true size is what lets `FeatureMediaStage` reserve
 * a correct box and refuse to display any of them larger than 1x.
 * Presenting the 211x144 sandwich crop at roughly 418x523, as the carousel
 * previously did, is what made the menu look soft; no re-export can add
 * detail that was never captured.
 */

export interface MenuCategoryMedia {
  /** A `public/`-relative path, e.g. `/menu/steaks.jpg` — never a data URI or external URL. */
  readonly assetPath: string;
  /** Describes the category's food style honestly — never claims to depict one specific dish when the source photo is category-level. */
  readonly alt: string;
  /** The file's real width in pixels — a fact about the file, never a target display size. */
  readonly width: number;
  /** The file's real height in pixels. */
  readonly height: number;
}

export const menuCategoryMedia: Readonly<Record<string, MenuCategoryMedia | null>> = {
  sandwiches: {
    assetPath: '/menu/sandwiches.jpg',
    alt: 'A Cladium sandwich platter',
    width: 211,
    height: 144,
  },
  steaks: {
    assetPath: '/menu/steaks.jpg',
    alt: 'A grilled steak platter with vegetables',
    width: 221,
    height: 372,
  },
  'desi-cuisine': {
    assetPath: '/menu/desi-cuisine.jpg',
    alt: 'A traditional karahi dish served in a copper pot',
    width: 196,
    height: 371,
  },
  'exclusive-beef-entree': {
    assetPath: '/menu/exclusive-beef-entree.jpg',
    alt: "Cladium's signature grilled beef entree, close-up",
    width: 882,
    height: 144,
  },
  italian: {
    assetPath: '/menu/italian.jpg',
    alt: 'A bowl of penne pasta with chicken and broccoli',
    width: 181,
    height: 208,
  },
  chinese: {
    assetPath: '/menu/chinese.jpg',
    alt: 'A wok of fried rice with vegetables',
    width: 181,
    height: 216,
  },
  'extra-side': {
    assetPath: '/menu/extra-side.jpg',
    alt: 'A fresh salad with tomato, feta, and mint',
    width: 176,
    height: 201,
  },
  starters: {
    assetPath: '/menu/starters.jpg',
    alt: 'A mixed starters platter with dips',
    width: 196,
    height: 259,
  },
  soup: {
    assetPath: '/menu/soup.jpg',
    alt: 'A bowl of chicken corn soup',
    width: 196,
    height: 209,
  },
  burgers: {
    assetPath: '/menu/burgers.jpg',
    alt: 'A grilled chicken burger on a wooden board',
    width: 235,
    height: 201,
  },
  'bar-menu': {
    assetPath: '/menu/bar-menu.jpg',
    alt: 'A selection of fruit chillers, shakes, and iced drinks',
    width: 206,
    height: 359,
  },
  bbq: {
    assetPath: '/menu/bbq.jpg',
    alt: 'A mixed platter of grilled chicken and beef skewers',
    width: 216,
    height: 330,
  },
};

/** `null` when no approved image exists yet for this category — callers must render the graceful fallback (`FeatureMediaStage`), never a broken image or an invented photo. */
export function resolveCategoryMedia(categoryId: string): MenuCategoryMedia | null {
  return menuCategoryMedia[categoryId] ?? null;
}

/**
 * Group-level photography — one step finer than a category, one step
 * coarser than a dish.
 *
 * BBQ is the case that forced this. Its 12 items split into real
 * sub-groups in `menu.json` — Beef, Chicken, Turkish — and a single
 * category photo cannot represent all three honestly: a plate of beef
 * skewers shown against "Chicken Malai Boti" is a false statement about
 * the food, which is exactly what the per-item map below refuses to make.
 *
 * A group photo can be honest without identifying a dish. "Beef skewers
 * grilling over charcoal" is true of every item in the Beef group, and
 * claims nothing about which one is pictured. That is the whole reason
 * this layer exists rather than keying per item.
 *
 * Keyed by `<category stable id>.<group slug>`, using the same `slugify`
 * the adapter applies when it builds item stable ids
 * (`adapter.ts` — `bbq.beef.beef-seekh-kabab`), so the key here is the
 * prefix of the ids of exactly the items it describes.
 *
 * Provenance: supplied by the owner in September 2026 as frames from
 * grill footage. Each was cropped to remove the source app's interface —
 * like/comment/share counts and a creator handle were burned into the
 * originals — and then re-checked visually, not assumed clean. Alt text
 * describes the group, never a named dish.
 */
export const menuGroupMedia: Readonly<Record<string, MenuCategoryMedia>> = {
  'bbq.beef': {
    assetPath: '/menu/bbq.beef.jpg',
    alt: 'Skewers of marinated beef grilling over glowing charcoal',
    width: 940,
    height: 820,
  },
  'bbq.chicken': {
    assetPath: '/menu/bbq.chicken.jpg',
    alt: 'Grilled chicken pieces served on a wooden platter with onion and carrot',
    width: 940,
    height: 490,
  },
};

/**
 * The group photo covering one item, or `null` when the item's group has
 * none — in which case the caller falls back to the category photo, which
 * is still a true statement about the category.
 */
export function resolveGroupMedia(
  categoryStableId: string,
  groupLabel: string | null,
): MenuCategoryMedia | null {
  if (!groupLabel) return null;
  const slug = groupLabel
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return menuGroupMedia[`${categoryStableId}.${slug}`] ?? null;
}

export interface MenuItemMedia extends MenuCategoryMedia {
  /** Square derivative for the circular rail selector, which renders at 3.5rem. */
  readonly thumbPath: string;
}

/**
 * Per-item photography — populated September 2026.
 *
 * This map was empty for a real reason, and that reason has now been met
 * rather than waived. The printed source pages carried one representative
 * photograph per category, never one per dish, and the September venue
 * shoot contained plates nobody had identified — so every earlier
 * candidate would have been a guess about which menu row it showed.
 *
 * These are different: the owner supplied them **named after the dish**
 * (`Assets/mappings`, preserved at
 * `cladium-research/assets/provided/mappings`). The name is the owner's own
 * identification of their own food, which is the confirmation that was
 * missing before — not an inference drawn from looking at a picture.
 *
 * Each one was still opened and checked against its name before being
 * listed here, because a filename is a claim and not a verification. Two
 * supplied files failed that check and are deliberately absent:
 *
 * - `Mint Sauce.jpeg` shows a dark brown sesame-flecked sauce, not a mint
 *   sauce. Whatever it is, it is not what it is named, so it maps to
 *   nothing.
 * - `Cladium Special Sandwich.jpeg` is a multi-dish promotional frame
 *   (a steak, a pasta and a sandwich under a caption), not a photograph of
 *   the sandwich. `special sandwich.jpeg` — a clean single-plate shot of
 *   the club sandwich — is used for that item instead.
 *
 * Keyed by `menu_items.stable_id`, which `MenuViewItem.mediaKey` carries.
 * It is emphatically **not** keyed by `MenuViewItem.id`: that is the row
 * UUID, regenerated by every menu import, so the map would go silently
 * dark on the next publish. A unit test asserts every key here still
 * resolves to a real item in `menu.json`, so a renamed dish fails the
 * suite rather than quietly losing its photograph.
 *
 * Provenance: the owner's own social frames. Each was cropped to remove the
 * source app's interface — like/comment/share counts and a creator handle
 * were burned into the originals — and, for the smoothie, a baked-in
 * "CLADIUM CAFE&RESORT" title band. Cropping a band away is not the same
 * as erasing it: no pixel is painted over or reconstructed, and every
 * original is preserved untouched. Dimensions below are the crop's real
 * size; nothing is upscaled.
 */
export const menuItemMedia: Readonly<Record<string, MenuItemMedia>> = {
  'bar-menu.special-hot-beverages.cappuccino': {
    assetPath: '/menu/items/bar-menu.special-hot-beverages.cappuccino.webp',
    thumbPath: '/menu/items/bar-menu.special-hot-beverages.cappuccino-thumb.webp',
    alt: 'Two cappuccinos, one finished with leaf latte art and one with a chocolate swirl',
    width: 900,
    height: 1416,
  },
  'desi-cuisine.chicken-biryani': {
    assetPath: '/menu/items/desi-cuisine.chicken-biryani.webp',
    thumbPath: '/menu/items/desi-cuisine.chicken-biryani-thumb.webp',
    alt: 'A platter of chicken biryani topped with tomato and cucumber, served with kebabs alongside',
    width: 646,
    height: 388,
  },
  'desi-cuisine.chicken-peshawari-karahi': {
    assetPath: '/menu/items/desi-cuisine.chicken-peshawari-karahi.webp',
    thumbPath: '/menu/items/desi-cuisine.chicken-peshawari-karahi-thumb.webp',
    alt: 'Chicken Peshawari karahi in a black wok with green chillies, ginger and coriander',
    width: 900,
    height: 1428,
  },
  'desi-cuisine.chicken-handi': {
    assetPath: '/menu/items/desi-cuisine.chicken-handi.webp',
    thumbPath: '/menu/items/desi-cuisine.chicken-handi-thumb.webp',
    alt: 'A creamy chicken handi finished with cream and coriander, served with naan and salad',
    width: 900,
    height: 757,
  },
  'italian.cladium-special-pasta': {
    assetPath: '/menu/items/italian.cladium-special-pasta.webp',
    thumbPath: '/menu/items/italian.cladium-special-pasta-thumb.webp',
    alt: 'Fettuccine in a white sauce topped with sliced grilled chicken',
    width: 900,
    height: 704,
  },
  'bar-menu.cladium-fruit-chillers.mint-margarita': {
    assetPath: '/menu/items/bar-menu.cladium-fruit-chillers.mint-margarita.webp',
    thumbPath: '/menu/items/bar-menu.cladium-fruit-chillers.mint-margarita-thumb.webp',
    alt: 'Two glasses of chilled mint margarita with straws',
    width: 444,
    height: 413,
  },
  'bar-menu.cladium-special-smoothies.strawberry-smoothie': {
    assetPath: '/menu/items/bar-menu.cladium-special-smoothies.strawberry-smoothie.webp',
    thumbPath: '/menu/items/bar-menu.cladium-special-smoothies.strawberry-smoothie-thumb.webp',
    alt: 'A tall glass of pink strawberry smoothie on a garden table',
    width: 900,
    height: 965,
  },
  /*
   * The one entry identified by a caption rather than a filename — the
   * owner burned "Tawa Beef" into the frame itself, over their own
   * `cladium.cafe` handle. That is the same kind of statement a filename
   * is (the owner naming their own food), from the same batch, so it meets
   * the same bar; it simply arrived written on the image instead of beside
   * it. The caption band was then cropped away like the smoothie's title:
   * a crop, never an erasure, and the original is preserved with the
   * caption intact.
   *
   * Two nearby frames show what is plainly the same dish, uncaptioned. They
   * are deliberately *not* used here — "it looks like the same food" is the
   * inference this map exists to refuse. One of them ships as
   * `diningMedia.sizzlingBeefPlatter`, where it claims nothing beyond what
   * is visible.
   */
  'exclusive-beef-entree.tawa-beef': {
    assetPath: '/menu/items/exclusive-beef-entree.tawa-beef.webp',
    thumbPath: '/menu/items/exclusive-beef-entree.tawa-beef-thumb.webp',
    alt: 'Tawa beef strips scattered with sesame and green chilli on a cast-iron platter',
    width: 961,
    height: 811,
  },
  'sandwiches.cladium-special-sandwich': {
    assetPath: '/menu/items/sandwiches.cladium-special-sandwich.webp',
    thumbPath: '/menu/items/sandwiches.cladium-special-sandwich-thumb.webp',
    alt: 'A club sandwich cut into quarters on a slate board with fries',
    width: 898,
    height: 1057,
  },
};

/**
 * Square thumbnail for one menu item, or `null` when none is approved.
 * Callers must render a non-photographic fallback for `null`; they must
 * never substitute the category photo, which would present one picture as
 * several different dishes.
 *
 * Takes `MenuViewItem.mediaKey` (the stable id), never `.id`.
 */
export function resolveItemThumb(itemMediaKey: string): string | null {
  return menuItemMedia[itemMediaKey]?.thumbPath ?? null;
}
