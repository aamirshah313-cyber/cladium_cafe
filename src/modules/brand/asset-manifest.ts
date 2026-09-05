/**
 * Typed manifest for the real brand and venue imagery the public site uses.
 *
 * Every entry points at a derivative under `public/brand/` or
 * `public/venue/` generated from an original in
 * `cladium-research/assets/provided/`, which is preserved untouched — the
 * derivatives are an optimization, never a replacement, and nothing here
 * may reference an external or expiring URL.
 *
 * `sourcePath` is recorded so a derivative can always be regenerated from,
 * and audited against, the artwork the owner actually supplied. Alt text is
 * written to describe what the photograph genuinely shows; it never claims
 * an award, a rating, a specific dish, or a facility the venue has not
 * confirmed.
 *
 * The logo is supplied artwork: it is scaled and re-encoded only. It is
 * never recoloured, cropped, mirrored (including under RTL), redrawn with a
 * font, or presented as a photograph of the real property — its illustrated
 * cabin and lake are part of the crest, not documentation of the venue.
 */

export interface BrandAsset {
  /** `public/`-relative path, e.g. `/brand/cladium-logo-384.webp`. Never an external URL. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
  /** The preserved original this was generated from. */
  readonly sourcePath: string;
}

export interface ImageAsset extends BrandAsset {
  /** Honest description of what the image actually shows. */
  readonly alt: string;
  /**
   * `object-position` for this crop, so a focal subject stays in frame at
   * whatever box the layout gives it.
   */
  readonly focalPoint: string;
}

const LOGO_SOURCE = 'cladium-research/assets/provided/Bigger LOGO.jpg';
const VENUE_SOURCE =
  'cladium-research/assets/provided/Pictures/713903386_122094484275358962_9090042462749697376_n.jpg';

/**
 * The supplied Cladium crest, square, aspect ratio preserved at every size.
 * Sizes exist so the header can use a small mark and the footer a larger
 * one without either being a stretched or unreadable postage stamp.
 */
export const brandLogo = {
  small: { path: '/brand/cladium-logo-96.webp', width: 96, height: 96, sourcePath: LOGO_SOURCE },
  medium: {
    path: '/brand/cladium-logo-192.webp',
    width: 192,
    height: 192,
    sourcePath: LOGO_SOURCE,
  },
  large: { path: '/brand/cladium-logo-384.webp', width: 384, height: 384, sourcePath: LOGO_SOURCE },
  xlarge: {
    path: '/brand/cladium-logo-768.webp',
    width: 768,
    height: 768,
    sourcePath: LOGO_SOURCE,
  },
  /** PNG for surfaces that cannot take WebP (favicon/social preview generation). */
  raster: { path: '/brand/cladium-logo-512.png', width: 512, height: 512, sourcePath: LOGO_SOURCE },
} as const satisfies Record<string, BrandAsset>;

/**
 * The real garden photograph, the one authentic venue image available.
 *
 * The original is portrait (1536 × 2048), so the desktop hero is a
 * deliberate landscape crop rather than a squashed full frame: both crops
 * were visually checked to confirm the timber counter, the warm lights and
 * the garden path all survive the crop, which is the entire reason the
 * photograph is worth using.
 */
export const venueHero = {
  wide: {
    path: '/venue/garden-hero-wide.webp',
    width: 1920,
    height: 1080,
    sourcePath: VENUE_SOURCE,
    alt: 'The Cladium garden at dusk: a lit timber pavilion counter, blue lanterns, string lights through the trees, and a path across the lawn',
    focalPoint: 'center 45%',
  },
  wideSmall: {
    path: '/venue/garden-hero-wide-1280.webp',
    width: 1280,
    height: 720,
    sourcePath: VENUE_SOURCE,
    alt: 'The Cladium garden at dusk: a lit timber pavilion counter, blue lanterns, string lights through the trees, and a path across the lawn',
    focalPoint: 'center 45%',
  },
  portrait: {
    path: '/venue/garden-hero-portrait.webp',
    width: 900,
    height: 1200,
    sourcePath: VENUE_SOURCE,
    alt: 'The Cladium garden at dusk: a lit timber pavilion counter, blue lanterns, string lights through the trees, and a path across the lawn',
    focalPoint: 'center 50%',
  },
} as const satisfies Record<string, ImageAsset>;

/** Tiny blurred placeholder so the hero reserves its space without a flash of empty colour. */
export const venueHeroBlurPath = '/venue/garden-hero-blur.webp';
