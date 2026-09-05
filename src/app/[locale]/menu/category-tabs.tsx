'use client';

/**
 * Menu carousel category tabs — `design/menu-carousel-reference.md`'s
 * `CategoryTabs`. A real ARIA APG tablist: `role="tablist"`/`role="tab"`,
 * `aria-selected`, `aria-controls` pointing at the details panel this
 * carousel renders, and roving tabindex (`use-roving-tabindex.ts`) for
 * arrow-key/Home/End navigation.
 */

import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import { useRovingTabIndex } from './use-roving-tabindex';

export interface CategoryTabsProps {
  readonly categories: readonly { readonly id: string; readonly name: string }[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly detailsPanelId: string;
  readonly locale: Locale;
}

export function CategoryTabs({
  categories,
  selectedIndex,
  onSelect,
  detailsPanelId,
  locale,
}: CategoryTabsProps) {
  const { tabIndexFor, onKeyDown, registerRef } = useRovingTabIndex(
    categories.length,
    selectedIndex,
    onSelect,
  );

  return (
    <div
      role="tablist"
      aria-label={chromeText('carouselCategoryTablistLabel', locale)}
      className="menu-carousel-tablist"
      onKeyDown={(event) => onKeyDown(event, selectedIndex)}
    >
      {categories.map((category, index) => (
        <button
          key={category.id}
          type="button"
          role="tab"
          id={`menu-carousel-tab-${category.id}`}
          aria-selected={index === selectedIndex}
          aria-controls={detailsPanelId}
          tabIndex={tabIndexFor(index)}
          ref={registerRef(index)}
          className="menu-carousel-tab"
          onClick={() => onSelect(index)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
