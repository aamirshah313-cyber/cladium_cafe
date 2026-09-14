/**
 * Shared presentation for the September 2026 venue and dining photography
 * (`modules/brand/media-manifest.ts`).
 *
 * ## Why these are plain `<img>` and not `next/image`
 *
 * The derivatives are already generated at their sources' own pixels and
 * encoded as WebP, and the sources are small — roughly 335–415px wide. The
 * optimizer has nothing left to do for them, and routing them through it
 * would add a request round-trip per image for no gain. The hero, which is
 * genuinely large and needs art direction, uses its own `<picture>` in
 * `page.tsx` for the same reason.
 *
 * ## Sizes are capped at the file's real pixels — structurally
 *
 * `width`/`height` carry the true dimensions so the box is reserved before
 * the bytes arrive and nothing shifts. But a layout can still ask for more
 * than the file has: `width: 100%` inside a container wider than the source
 * silently enlarges it, which is exactly what happened to the two homepage
 * experience cards — 335px photographs rendered at 462px on a 1440px
 * screen, the same enlargement defect this pass exists to remove from the
 * menu, reintroduced one section away from it.
 *
 * Relying on every future rule to remember the source widths is what let
 * that through. So the real width is published as `--intrinsic-w` and the
 * stylesheet caps against it with `max-width: min(100%, var(--intrinsic-w))`.
 * A layout may now be as wide as it likes; the picture simply stops
 * growing at 1x and centres, and any new rule that forgets inherits the
 * cap rather than a bug.
 *
 * ## Alt text
 *
 * Comes from the manifest, where each string describes only what is
 * visible in the frame. Decorative repeats — a photograph next to copy that
 * already says the same thing — pass `decorative` so they are hidden from
 * assistive technology instead of read out twice.
 */

import type { CSSProperties } from 'react';
import type { SiteMediaAsset } from '../../modules/brand/media-manifest';

interface SitePhotoProps {
  readonly asset: SiteMediaAsset;
  readonly className?: string;
  /** Hide from assistive tech: the adjacent copy already carries the meaning. */
  readonly decorative?: boolean;
  /** `eager` only for something genuinely above the fold. */
  readonly loading?: 'lazy' | 'eager';
}

export function SitePhoto({
  asset,
  className,
  decorative = false,
  loading = 'lazy',
}: SitePhotoProps) {
  return (
    <img
      src={asset.path}
      alt={decorative ? '' : asset.alt}
      aria-hidden={decorative || undefined}
      width={asset.width}
      height={asset.height}
      className={className}
      /*
       * `--intrinsic-w` is the file's real width, handed to CSS so a layout
       * cannot enlarge it past 1x. See the module comment.
       */
      style={
        { objectPosition: asset.focalPoint, '--intrinsic-w': `${asset.width}px` } as CSSProperties
      }
      loading={loading}
      decoding="async"
    />
  );
}

interface SceneBackdropProps {
  readonly asset: SiteMediaAsset;
}

/**
 * A photograph used as atmosphere *behind* a section that keeps its own
 * theme colours — not as a hero the copy sits on top of.
 *
 * ## Why it is `aria-hidden` and has no alt text
 *
 * It carries no information. Every section using one already states its
 * content in text, and a screen reader announcing "a peacock walking past
 * the lit pavilion bar" in the middle of the opening hours would be noise,
 * not access. The same photographs appear with their real alt text in the
 * gallery, where they are the content.
 *
 * ## Why the image is blurred, and why that is not hiding anything
 *
 * Two independent reasons, and both would apply alone:
 *
 * 1. **Contrast has to stay predictable.** Body copy here uses
 *    `--text-primary` on `--surface-canvas`, a pairing already checked for
 *    AA in all six themes. A sharp photograph behind it introduces local
 *    variance — one word over a bright lamp, the next over dark foliage —
 *    that no single measurement covers. Blurring flattens that variance, and
 *    the veil above it is the current theme's *own* canvas colour at high
 *    opacity, so the effective text background stays within a hair of the
 *    value that was checked. The section needs no on-image palette, and
 *    changing theme changes the wash automatically.
 * 2. **These are 884-900px sources spanning the full viewport.** Displayed
 *    sharp across a 1440px screen that is a 1.6x enlargement, the exact
 *    defect the rest of this module exists to prevent. A deliberately
 *    defocused wash makes no sharpness claim, so the enlargement is not one
 *    either — but the cap is still published in `--intrinsic-w` for any
 *    rule that wants it.
 *
 * `background-attachment` is deliberately *not* `fixed`: it forces a repaint
 * on every scroll frame and is ignored on most mobile browsers anyway, so it
 * would cost jank on the devices this site is built for and buy nothing.
 */
export function SceneBackdrop({ asset }: SceneBackdropProps) {
  return (
    <div
      className="home-scene-backdrop"
      aria-hidden="true"
      style={
        {
          '--scene-image': `url(${asset.path})`,
          '--scene-position': asset.focalPoint,
          '--intrinsic-w': `${asset.width}px`,
        } as CSSProperties
      }
    />
  );
}

interface PhotoGridProps {
  readonly assets: readonly SiteMediaAsset[];
  readonly label: string;
}

/**
 * The curated gallery: a responsive grid of distinct scenes.
 *
 * Deliberately **not** a lightbox. These files are around 335–415px wide,
 * so a full-screen viewer would have nothing more to show than the grid
 * already does — it would enlarge them well past the point where they hold
 * up, which is a worse experience presented as a better one.
 *
 * The list is a `<ul>` because it is one: a set of sibling images with no
 * ordering claim. Each caption is real text under the picture rather than a
 * hover tooltip, so it is available on touch devices and to anyone reading
 * with a screen reader.
 */
export function PhotoGrid({ assets, label }: PhotoGridProps) {
  return (
    <ul className="site-photo-grid" aria-label={label}>
      {assets.map((asset) => (
        <li key={asset.path} className="site-photo-grid-item">
          <figure className="site-photo-figure">
            <SitePhoto asset={asset} className="site-photo-grid-image" />
            <figcaption className="site-photo-caption">{asset.alt}</figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
