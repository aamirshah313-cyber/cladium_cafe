'use client';

/**
 * Horizontal overflow state for a scrolling strip.
 *
 * Used by both the category tablist and the item selector rail — the two
 * places in the carousel where content runs past its box.
 *
 * The menu has twelve categories, and their names are long enough in both
 * English and Urdu that the strip overflows on every phone and most
 * laptops. Overflow on its own is not a defect — the strip scrolls — but
 * with nothing at the edges there is no indication that more categories
 * exist, so people simply do not find the ones past the fold.
 *
 * This hook reports whether the strip actually overflows and which
 * directions can still be scrolled, so the carousel can render edge
 * controls **only when they are needed and only when they would do
 * something**. It measures the live element rather than guessing from a
 * breakpoint, because the deciding factor is the rendered width of
 * translated text, which no breakpoint knows.
 *
 * The controls it drives are a convenience layered on top of scrolling and
 * keyboard tab navigation, both of which keep working unchanged; they are
 * never the only way to reach a category.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface OverflowControls {
  readonly ref: (element: HTMLElement | null) => void;
  /** True when the content is wider than the box — controls are pointless otherwise. */
  readonly overflowing: boolean;
  readonly canScrollStart: boolean;
  readonly canScrollEnd: boolean;
  readonly scrollByPage: (direction: -1 | 1) => void;
}

/** Sub-pixel slack, so a rounding remainder never leaves a control enabled at rest. */
const EDGE_TOLERANCE = 2;

export function useOverflowControls(): OverflowControls {
  const elementRef = useRef<HTMLElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  const measure = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    setOverflowing(max > EDGE_TOLERANCE);
    /*
     * `scrollLeft` is negative in a right-to-left box in every engine this
     * project targets, so the distances are taken from its magnitude. That
     * makes "start" mean the side the reader begins at in the current
     * writing mode, not the physical left edge — which is what the labels
     * and the arrows have to agree with in Urdu.
     */
    const offset = Math.abs(element.scrollLeft);
    setCanScrollStart(offset > EDGE_TOLERANCE);
    setCanScrollEnd(offset < max - EDGE_TOLERANCE);
  }, []);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element;
      if (element) measure();
    },
    [measure],
  );

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    measure();
    element.addEventListener('scroll', measure, { passive: true });

    // Re-measure on resize *and* on the element's own size changing — a
    // font swap or a locale change alters the content width without any
    // window resize event.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    observer?.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const element = elementRef.current;
    if (!element) return;
    // Most of a screenful, not all of it: leaving a tab visible on both
    // sides of the jump keeps the reader's place.
    const step = Math.max(element.clientWidth * 0.8, 120);
    const rtl = getComputedStyle(element).direction === 'rtl';
    /*
     * `behavior: 'smooth'` is not covered by the stylesheet's
     * reduced-motion rules — it is a scripted scroll, so the preference has
     * to be read here or the animation happens regardless of the setting.
     */
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    element.scrollBy({
      left: step * direction * (rtl ? -1 : 1),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, []);

  return { ref, overflowing, canScrollStart, canScrollEnd, scrollByPage };
}
