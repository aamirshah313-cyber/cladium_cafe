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
 * ## Sizes are capped at the file's real pixels
 *
 * Every layout below sizes these photographs *at or below* what they
 * actually contain. `width`/`height` carry the true dimensions so the box
 * is reserved before the bytes arrive and nothing shifts, and the CSS never
 * asks for more. Enlargement is the exact defect this photography pass
 * exists to remove from the menu; reintroducing it on the homepage would be
 * the same mistake in a different place.
 *
 * ## Alt text
 *
 * Comes from the manifest, where each string describes only what is
 * visible in the frame. Decorative repeats — a photograph next to copy that
 * already says the same thing — pass `decorative` so they are hidden from
 * assistive technology instead of read out twice.
 */

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
      style={{ objectPosition: asset.focalPoint }}
      loading={loading}
      decoding="async"
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
