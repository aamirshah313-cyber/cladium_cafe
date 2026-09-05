'use client';

/**
 * Shared roving-tabindex keyboard behavior — ARIA APG's pattern for a
 * tablist/listbox: only the active item is a tab stop (`tabIndex={0}`),
 * every other item is `tabIndex={-1}`, and arrow keys move both focus and
 * selection between items without the guest ever tabbing through each one
 * individually. `menu-carousel-reference.md` requires this for both
 * `CategoryTabs` and `ItemSelectorRail`; no existing component in this
 * codebase needed it before (`theme-toggle.tsx`'s two-button group is
 * small enough that plain Tab-between-buttons is fine).
 *
 * Direction-aware: reads the container's own computed `direction` at
 * keydown time (not just `dir="rtl"` on the element itself, since it may
 * inherit from an ancestor, e.g. `/ur`'s `<html dir="rtl">`) so ArrowLeft/
 * ArrowRight mean "toward the start/end of reading order" in both locales,
 * not always "toward lower/higher index."
 */

import { useRef } from 'react';

export interface RovingTabIndexItem<T> {
  readonly value: T;
  readonly ref: (el: HTMLElement | null) => void;
}

export interface UseRovingTabIndexResult {
  readonly tabIndexFor: (index: number) => 0 | -1;
  readonly onKeyDown: (event: React.KeyboardEvent, currentIndex: number) => void;
  readonly registerRef: (index: number) => (el: HTMLElement | null) => void;
}

/**
 * `count` is the number of items in the roving group; `selectedIndex` is
 * the currently active one (receives `tabIndex={0}`); `onSelect` is called
 * with the new index whenever an arrow/Home/End key moves it — the caller
 * owns the actual selection state, this hook only computes the next index
 * and moves DOM focus to it.
 */
export function useRovingTabIndex(
  count: number,
  selectedIndex: number,
  onSelect: (index: number) => void,
): UseRovingTabIndexResult {
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  function registerRef(index: number) {
    return (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    };
  }

  function tabIndexFor(index: number): 0 | -1 {
    return index === selectedIndex ? 0 : -1;
  }

  function moveTo(index: number) {
    const clamped = ((index % count) + count) % count;
    onSelect(clamped);
    itemRefs.current[clamped]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, currentIndex: number) {
    const container = event.currentTarget as HTMLElement;
    const isRtl = getComputedStyle(container).direction === 'rtl';
    const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = isRtl ? 'ArrowRight' : 'ArrowLeft';

    switch (event.key) {
      case forward:
        event.preventDefault();
        moveTo(currentIndex + 1);
        break;
      case backward:
        event.preventDefault();
        moveTo(currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        break;
      case 'End':
        event.preventDefault();
        moveTo(count - 1);
        break;
      default:
        break;
    }
  }

  return { tabIndexFor, onKeyDown, registerRef };
}
