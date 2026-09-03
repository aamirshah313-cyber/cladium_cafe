/**
 * Menu carousel media stage — `cladium-research/design/menu-carousel-
 * reference.md`'s `FeatureMediaStage`, built now that a real, approved
 * media mapping exists (`modules/menu/media-mapping.ts`), ahead of the
 * full carousel it belongs to.
 *
 * Renders the approved category photo once one is cropped and wired into
 * `media-mapping.ts`. Until then: the spec's own documented fallback — "a
 * graceful abstract Cladium place-setting/ingredient texture or a category
 * monogram" — never a stock photo, never a "missing image" apology, never
 * a collapsing blank region. The fallback SVG is a small, original,
 * abstract mountain-path motif — not a redrawing of the real crest
 * artwork; `theme-mode.md` is explicit that a theme/placeholder state must
 * never "create a new logo."
 *
 * Not yet wired into `/menu` — the full `MenuFeatureCarousel` (CategoryTabs,
 * FeaturedItemDetails, ItemSelectorRail) is Step 18's own scope, itself
 * still gated on the menu actually being published (D-021). This
 * component is real, typed, and ready for that wiring, not a placeholder
 * itself — the placeholder is only ever the *visual state it renders* when
 * a category has no approved photo yet.
 */

import Image from 'next/image';
import type { MenuCategoryMedia } from '../../../modules/menu/media-mapping';

export interface FeatureMediaStageProps {
  readonly categoryName: string;
  readonly media: MenuCategoryMedia | null;
}

export function FeatureMediaStage({ categoryName, media }: FeatureMediaStageProps) {
  if (media) {
    return (
      <div className="menu-media-stage">
        <Image
          src={media.assetPath}
          alt={media.alt}
          fill
          sizes="(min-width: 768px) 480px, 100vw"
          className="menu-media-stage-image"
        />
      </div>
    );
  }

  // No approved photo yet for this category — the graceful fallback, not a
  // missing/broken state. Purely decorative and uninformative on its own
  // (the category name is already presented as real text elsewhere in the
  // carousel), so the whole stage is aria-hidden rather than described.
  return (
    <div
      className="menu-media-stage menu-media-stage-fallback"
      aria-hidden="true"
      data-category={categoryName}
    >
      <svg
        viewBox="0 0 200 200"
        focusable="false"
        className="menu-media-stage-monogram"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="100" cy="100" r="72" className="menu-media-stage-monogram-ring" />
        <path d="M40 128 Q75 88 100 118 T170 96" className="menu-media-stage-monogram-path" />
      </svg>
    </div>
  );
}
