'use client';

/**
 * Menu carousel item selector rail — `design/menu-carousel-reference.md`'s
 * `ItemSelectorRail`. A horizontally scrollable, touch-scrollable row of
 * items for the currently selected category, `role="listbox"`/
 * `role="option"` with roving tabindex, and an `aria-live="polite"` region
 * announcing the newly selected item's name (the spec's own requirement) —
 * text only, so it works for a screen-reader user regardless of whether
 * the visual details panel is currently in view.
 */

import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import { useRovingTabIndex } from './use-roving-tabindex';

export interface ItemSelectorRailProps {
  readonly items: readonly { readonly id: string; readonly name: string }[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly locale: Locale;
}

export function ItemSelectorRail({
  items,
  selectedIndex,
  onSelect,
  locale,
}: ItemSelectorRailProps) {
  const { tabIndexFor, onKeyDown, registerRef } = useRovingTabIndex(
    items.length,
    selectedIndex,
    onSelect,
  );
  const selectedName = items[selectedIndex]?.name ?? '';

  return (
    <>
      <div
        role="listbox"
        aria-label={chromeText('carouselItemListboxLabel', locale)}
        className="menu-carousel-item-rail"
        onKeyDown={(event) => onKeyDown(event, selectedIndex)}
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            tabIndex={tabIndexFor(index)}
            ref={registerRef(index)}
            className="menu-carousel-item-selector"
            onClick={() => onSelect(index)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="menu-carousel-visually-hidden">
        {selectedName}
      </p>
    </>
  );
}
