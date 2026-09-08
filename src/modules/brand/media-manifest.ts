/**
 * Typed manifest for the venue and dining photography supplied in
 * September 2026 (`cladium-research/assets/provided/newpics`, 43 files).
 *
 * Extends `asset-manifest.ts` rather than replacing it: the crest and the
 * high-resolution garden hero live there and are unchanged. Everything here
 * is a *second* tier of smaller, real photographs used for story, gallery,
 * seating, evening and dining vignettes.
 *
 * ## What was excluded, and why it matters
 *
 * Every file was opened and inspected — via the three contact sheets and
 * individually — rather than selected by filename, because a filename
 * establishes nothing about what an image shows. Excluded outright:
 * marketing posters and collages with overlaid text (`images (7)`, `(10)`,
 * `(13)`, `(16)`, `(22)`, `(25)`, `(33)`, `(35)`, `(36)`), a frame carrying
 * a third-party watermark (`images (30)`, "cynas.photo.shop"), a screenshot
 * with interface overlay (`images (38)`), and files too small to present
 * honestly (`images (20)` at 168x299, `images (9)` at 225x225). Overlaid
 * text is not erased to make an image usable — that would be fabricating
 * source integrity.
 *
 * Two byte-identical duplicate pairs were confirmed by SHA-256:
 * `images (2)`/`images (19)` and `images (5)`/`images (27)`. Only one of
 * each is referenced here; both originals are preserved untouched.
 *
 * ## Sizes are honest, not stretched
 *
 * These sources are roughly 335-415px wide. Derivatives are generated at
 * the source's own pixels — never upscaled — so `width`/`height` below are
 * real. They are intended for display around 160-260px, where they are
 * genuinely sharp at 2x. Presenting them full-bleed would be enlargement,
 * which is exactly the defect this pass exists to fix.
 *
 * ## Provenance is a contract, not a label
 *
 * `provenance` says what an image is allowed to claim:
 * - `venue` — a real photograph of the place.
 * - `category` — food, honestly presentable only as a category-level
 *   illustration, never as a named dish.
 * - `item` — a confirmed photograph of one specific menu item.
 *
 * **No image here is `item`.** Nobody has confirmed which menu row any of
 * these plates depicts, and guessing from a photograph which steak, burger
 * or karahi it shows would invent a fact about published food. Until an
 * owner confirms specific mappings, food images stay category-level and any
 * surface displaying one beside a dish name must say so visibly.
 */

export type MediaProvenance = 'venue' | 'category' | 'item';

export interface SiteMediaAsset {
  /** The preserved original this was generated from. */
  readonly sourcePath: string;
  /** `public/`-relative derivative path. Never an external URL. */
  readonly path: string;
  /** Square derivative for circular selectors. */
  readonly thumbPath: string;
  readonly width: number;
  readonly height: number;
  /** Describes what the photograph actually shows — no claim beyond that. */
  readonly alt: string;
  readonly provenance: MediaProvenance;
  /** `object-position` so the subject survives whatever box the layout gives it. */
  readonly focalPoint: string;
}

const SRC = 'cladium-research/assets/provided/newpics';

function venue(
  file: string,
  slug: string,
  width: number,
  height: number,
  alt: string,
  focalPoint = 'center',
): SiteMediaAsset {
  return {
    sourcePath: `${SRC}/${file}`,
    path: `/venue/${slug}.webp`,
    thumbPath: `/venue/${slug}-thumb.webp`,
    width,
    height,
    alt,
    provenance: 'venue',
    focalPoint,
  };
}

function dining(
  file: string,
  slug: string,
  width: number,
  height: number,
  alt: string,
): SiteMediaAsset {
  return {
    sourcePath: `${SRC}/${file}`,
    path: `/dining/${slug}.webp`,
    thumbPath: `/dining/${slug}-thumb.webp`,
    width,
    height,
    alt,
    provenance: 'category',
    focalPoint: 'center',
  };
}

/** Real photographs of the venue. Alt text describes only what is visible. */
export const venueMedia = {
  pavilionCounterDay: venue(
    'images (5).jpg',
    'pavilion-counter-day',
    387,
    516,
    'The timber pavilion counter with stone base, under trees in daylight',
  ),
  pavilionThroughTrees: venue(
    'images (12).jpg',
    'pavilion-through-trees',
    415,
    739,
    'The timber pavilion seen between tall trees',
  ),
  gardenTableDusk: venue(
    'images (14).jpg',
    'garden-table-dusk',
    335,
    597,
    'A garden table under a parasol at dusk, with warm lights in the trees',
  ),
  gardenSeatingTrees: venue(
    'images (17).jpg',
    'garden-seating-trees',
    335,
    597,
    'Garden chairs and tables set out beneath mature trees',
  ),
  lawnChairsPavilion: venue(
    'images (18).jpg',
    'lawn-chairs-pavilion',
    415,
    739,
    'White garden chairs on the lawn in front of the timber pavilion',
  ),
  timberFootbridge: venue(
    'images (21).jpg',
    'timber-footbridge',
    335,
    597,
    'A timber footbridge running between trees through the garden',
  ),
  gardenLitPathDusk: venue(
    'images (23).jpg',
    'garden-lit-path-dusk',
    333,
    600,
    'A lit path curving through the garden at dusk',
  ),
  entranceSignDusk: venue(
    'images (29).jpg',
    'entrance-sign-dusk',
    387,
    516,
    'The Cladium entrance sign at dusk',
  ),
  terraceStringLightsNight: venue(
    'images (31).jpg',
    'terrace-string-lights-night',
    335,
    597,
    'The terrace at night, lit by strings of warm lights',
  ),
  counterLitNight: venue(
    'images (34).jpg',
    'counter-lit-night',
    387,
    516,
    'The timber counter lit up after dark',
  ),
  lawnPeacockPavilion: venue(
    'images (39).jpg',
    'lawn-peacock-pavilion',
    335,
    597,
    // Describes one moment that was photographed. It is not a promise that
    // wildlife is present on any given visit.
    'A peacock crossing the lawn in front of the pavilion',
  ),
  gardenNight: venue('images (41).jpg', 'garden-night', 387, 516, 'The garden after dark'),
} as const satisfies Record<string, SiteMediaAsset>;

/**
 * Food photography. Every entry is `category` provenance — see the module
 * comment. Alt text describes the plate as photographed and never names a
 * menu item.
 */
export const diningMedia = {
  platedDishGreens: dining(
    'images.jpg',
    'plated-dish-greens',
    335,
    597,
    'A plated dish with sauce and greens',
  ),
  platterFriesVegetables: dining(
    'oar2.jpg',
    'platter-fries-vegetables',
    405,
    720,
    'A sharing platter with fries, vegetables and a dip',
  ),
  platterFriesSalad: dining(
    'images (1).jpg',
    'platter-fries-salad',
    387,
    516,
    'A platter served with fries and salad',
  ),
  diningTableDishes: dining(
    'images (3).jpg',
    'dining-table-dishes',
    335,
    597,
    'Several dishes set out together on a table',
  ),
  boardFriesOutdoor: dining(
    'images (4).jpg',
    'board-fries-outdoor',
    335,
    597,
    'Fries served on a wooden board at an outdoor table',
  ),
  friesAndCup: dining('images (6).jpg', 'fries-and-cup', 515, 388, 'Fries beside a warm drink'),
  teaCupGarden: dining(
    'images (40).jpg',
    'tea-cup-garden',
    387,
    516,
    'A cup of tea held in the garden, with seating behind',
  ),
} as const satisfies Record<string, SiteMediaAsset>;

/**
 * The curated homepage gallery: distinct scenes only.
 *
 * Deliberately not padded to a rounder number by including a second view of
 * the same subject — the bridge and the pavilion each appear once. A
 * gallery that repeats one scene to look fuller is telling the visitor
 * there is more to see than there is.
 */
export const galleryMedia: readonly SiteMediaAsset[] = [
  venueMedia.timberFootbridge,
  venueMedia.entranceSignDusk,
  venueMedia.gardenNight,
  venueMedia.lawnPeacockPavilion,
  venueMedia.gardenLitPathDusk,
  venueMedia.pavilionCounterDay,
];

/**
 * Food images offered as the menu carousel's category-level illustration
 * pool, in a fixed order so a given category always shows the same picture
 * rather than appearing to change dish between visits.
 */
export const diningRotation: readonly SiteMediaAsset[] = [
  diningMedia.platedDishGreens,
  diningMedia.platterFriesVegetables,
  diningMedia.platterFriesSalad,
  diningMedia.boardFriesOutdoor,
  diningMedia.diningTableDishes,
  diningMedia.friesAndCup,
  diningMedia.teaCupGarden,
];
