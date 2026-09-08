/**
 * `FeatureMediaStage` — the carousel's dominant media panel.
 *
 * ## Why this stopped using a fixed ratio and `cover`
 *
 * It previously forced every photograph into `aspect-ratio: 4 / 5` with
 * `object-fit: cover`. The category sources are small and vary widely in
 * shape — 211x144 landscape for sandwiches, 882x144 for the beef crop — so
 * a fixed portrait box cropped hard into the subject *and* enlarged it:
 * the 211x144 sandwich photograph was being presented at roughly 418x523.
 * Enlarging a 211px-wide source past twice its width is what made the menu
 * look soft, and re-exporting the same pixels at a bigger size would not
 * have changed that.
 *
 * Now the stage reserves a stable box but the image sits inside it with
 * `contain` at its own aspect ratio, capped at its intrinsic width. A wide
 * crop stays wide, a portrait stays portrait, and nothing is displayed
 * larger than it actually is. The surrounding stage — a soft curved
 * sage/ivory field with restrained gold detail — is what gives the picture
 * presence, which is the reference clip's own trick: the plate reads as
 * dominant because of the space and backdrop around it, not because the
 * pixels were stretched.
 *
 * ## Honest labelling
 *
 * When the picture is category-level rather than a confirmed photograph of
 * the selected dish, a visible caption says so. Alt text alone is not
 * enough when a specific dish name is rendered right beside the image — a
 * sighted visitor would otherwise reasonably read the photo as that dish.
 */

import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import type { MediaProvenance } from '../../../modules/brand/media-manifest';
import type { MenuCategoryMedia } from '../../../modules/menu/media-mapping';

export interface FeatureMedia {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly provenance: MediaProvenance;
}

interface FeatureMediaStageProps {
  readonly media: FeatureMedia | null;
  readonly locale: Locale;
}

/**
 * Adapts the category photography mapping into the stage's shape.
 *
 * Provenance is hard-coded to `category` rather than passed in, because
 * every entry in `menuCategoryMedia` genuinely is category-level — the
 * printed source pages carried one representative photo per category, not
 * one per dish. A caller cannot upgrade that claim by asking.
 */
export function categoryFeatureMedia(media: MenuCategoryMedia | null): FeatureMedia | null {
  if (!media) return null;
  return {
    src: media.assetPath,
    alt: media.alt,
    width: media.width,
    height: media.height,
    provenance: 'category',
  };
}

export function FeatureMediaStage({ media, locale }: FeatureMediaStageProps) {
  if (!media) {
    // No approved photograph for this category: a calm Cladium mark rather
    // than a broken image or a stock plate. Decorative, so it is hidden
    // from assistive technology — the dish name beside it already carries
    // the meaning.
    return (
      <div className="menu-media-stage menu-media-stage-fallback" aria-hidden="true">
        <svg viewBox="0 0 200 200" className="menu-media-stage-monogram" focusable="false">
          <circle cx="100" cy="100" r="72" className="menu-media-stage-monogram-ring" />
          <path d="M40 128 Q75 88 100 118 T170 96" className="menu-media-stage-monogram-path" />
        </svg>
      </div>
    );
  }

  return (
    <div className="menu-media-stage">
      <div className="menu-media-stage-frame">
        {/*
         * `width`/`height` are the derivative's real pixels, so the browser
         * reserves the right box and the CSS never scales it past 1x.
         */}
        <img
          src={media.src}
          alt={media.alt}
          width={media.width}
          height={media.height}
          className="menu-media-stage-image"
          decoding="async"
        />
      </div>
      {media.provenance !== 'item' ? (
        <p className="menu-media-stage-caption">
          {chromeText('carouselCategoryPhotoCaption', locale)}
        </p>
      ) : null}
    </div>
  );
}
