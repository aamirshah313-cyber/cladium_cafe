'use client';

/**
 * `ItemSelectorRail` — the circular dish selectors, adapted from the
 * reference clip's row of round thumbnails.
 *
 * Semantics are unchanged from the previous text rail and deliberately so:
 * `role="listbox"`/`role="option"` with a roving tabindex, arrow-key
 * navigation, Enter/Space activation, and an `aria-live="polite"`
 * announcement of the selected item. Only the presentation changed.
 *
 * ## The circle is the control, not a crop of the dish
 *
 * Each selector is a round *button*, and the picture inside it is a square
 * derivative. That distinction matters: the reference shows round plates
 * photographed from above, which crop to circles naturally. Cladium's food
 * photographs are ordinary rectangular scenes, and masking one into a
 * circle would slice through the subject. So the circle is the control's
 * shape, filled with a centred square crop, while the main stage still
 * shows the whole uncropped picture.
 *
 * ## The name is always readable, independent of the image
 *
 * The dish name sits under each thumbnail rather than only in a tooltip or
 * alt attribute. No approved per-item photograph exists today
 * (`media-mapping.ts`), so every selector currently shows a lettered
 * medallion — which claims nothing — instead of repeating one category
 * photograph behind five differently-named dishes. The moment real item
 * mappings land, `thumbFor` starts returning them and nothing else here
 * has to change.
 *
 * Selection ring and focus ring are visually distinct: selection is a gold
 * ring on the circle plus a heavier name, focus is the shared outline. A
 * keyboard user moving through options can therefore always tell where
 * focus is versus what is chosen, and the weight change carries the
 * selected state without relying on colour.
 *
 * ## Scrolling past five
 *
 * A category can hold far more items than fit, so the rail scrolls. The
 * same edge controls the category strip uses appear here when — and only
 * when — there is something past the edge, because a strip that simply
 * runs off the side gives no indication that anything is there.
 */

import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import type { MenuViewItem } from '../../../modules/menu/menu-view';
import { useRovingTabIndex } from './use-roving-tabindex';
import { useOverflowControls } from './use-overflow-controls';

interface ItemSelectorRailProps {
  readonly items: readonly MenuViewItem[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly locale: Locale;
  /** Square thumbnail per item, aligned by index. `null` renders an initial. */
  readonly thumbFor: (item: MenuViewItem, index: number) => string | null;
}

export function ItemSelectorRail({
  items,
  selectedIndex,
  onSelect,
  locale,
  thumbFor,
}: ItemSelectorRailProps) {
  const { tabIndexFor, onKeyDown, registerRef } = useRovingTabIndex(
    items.length,
    selectedIndex,
    onSelect,
  );
  // Destructured for the same reason as the category strip — see
  // `menu-feature-carousel.tsx`.
  const {
    ref: railRef,
    overflowing,
    canScrollStart,
    canScrollEnd,
    scrollByPage,
  } = useOverflowControls();

  return (
    <div className="menu-carousel-rail-wrap">
      {/*
       * `aria-hidden` on the edge controls: they scroll a region the
       * listbox's own arrow keys already traverse, so exposing them would
       * add redundant stops that reach nothing new.
       */}
      {overflowing ? (
        <button
          type="button"
          className="menu-carousel-tabs-edge"
          aria-hidden="true"
          tabIndex={-1}
          disabled={!canScrollStart}
          onClick={() => scrollByPage(-1)}
        >
          <span className="menu-carousel-tabs-edge-glyph">&#8249;</span>
        </button>
      ) : null}

      <ul
        ref={railRef}
        role="listbox"
        aria-label={chromeText('carouselItemListboxLabel', locale)}
        className="menu-carousel-item-rail"
        onKeyDown={(event) => onKeyDown(event, selectedIndex)}
      >
        {items.map((item, index) => {
          const thumb = thumbFor(item, index);
          const selected = index === selectedIndex;
          return (
            <li key={item.id} className="menu-carousel-item-slot">
              <button
                ref={registerRef(index)}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={tabIndexFor(index)}
                className="menu-carousel-item-selector"
                onClick={() => onSelect(index)}
              >
                <span className="menu-carousel-thumb" aria-hidden="true">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      width={256}
                      height={256}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="menu-carousel-thumb-initial">{item.name.charAt(0)}</span>
                  )}
                </span>
                <span className="menu-carousel-thumb-name">{item.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {overflowing ? (
        <button
          type="button"
          className="menu-carousel-tabs-edge"
          aria-hidden="true"
          tabIndex={-1}
          disabled={!canScrollEnd}
          onClick={() => scrollByPage(1)}
        >
          <span className="menu-carousel-tabs-edge-glyph">&#8250;</span>
        </button>
      ) : null}

      <p role="status" aria-live="polite" className="menu-carousel-visually-hidden">
        {items[selectedIndex]?.name ?? ''}
      </p>
    </div>
  );
}
