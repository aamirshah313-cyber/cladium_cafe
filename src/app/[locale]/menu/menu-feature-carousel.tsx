'use client';

/**
 * Menu feature carousel — `design/menu-carousel-reference.md`'s
 * `MenuFeatureCarousel`, wiring `CategoryTabs`, `FeaturedItemDetails`,
 * `ItemSelectorRail`, and `FeatureMediaStage` together over the real
 * published menu.
 *
 * An editorial discovery feature, not the sole way to browse — `menu/
 * page.tsx` renders this above its own existing search/filter list, which
 * is completely unchanged. Uses the *unfiltered* `categories` prop, not
 * the text-search-filtered list, since this has its own independent
 * category-tab browsing model.
 *
 * ## Layout, and what was actually borrowed from the reference clip
 *
 * The clip's grammar is: a category strip across the top, a written panel
 * on the left at roughly 45% of the width, a row of round selectors beneath
 * it, and one dominant photograph on the right at roughly 55%. That
 * arrangement is what this now follows, and the proportion is the point —
 * the picture reads as dominant because of the space and the calm backdrop
 * around it, not because it was enlarged.
 *
 * Nothing else was taken. The clip's name, food photography, copy,
 * watermark and artwork are all its own (CLAUDE.md: interaction
 * inspiration only), and Cladium's photographs are rectangular scenes
 * rather than round plates shot from above, which is why the selectors are
 * round *controls* holding a square crop rather than circular dish cutouts.
 *
 * ## Transitions are declarative, so reduced motion is honoured for free
 *
 * Changing category or item remounts the panel and the stage via `key`,
 * replaying a short CSS fade/rise. There is no timer, no transition state
 * in React, and nothing to leave stuck if a click lands mid-animation —
 * rapid clicking simply restarts it. `@media (prefers-reduced-motion:
 * reduce)` in the stylesheet turns the animation off, and because the
 * effect lives entirely in CSS there is no JavaScript path that can ignore
 * that preference.
 *
 * ## The takeaway add action
 *
 * Gated on `takeawayEnabled`, resolved on the server from
 * `FEATURE_TAKEAWAY_REQUESTS` **and** `TAKEAWAY_GUEST_JOURNEY_COMPLETE`.
 * The cart/review destination it would lead to is not built yet, so with
 * the gate closed the control is not rendered at all. The panel is not left
 * actionless: "View dish details" links into the item's row in the full
 * list below, which is a destination that genuinely exists.
 *
 * That gate is deliberately the single switch for the journey. Disabling
 * the button only when a bootstrap request happens to fail would leave a
 * real dead end the moment the flag was switched on ahead of the cart page:
 * a guest could add items and watch a subtotal climb with nowhere to submit
 * it.
 *
 * When enabled, "Add to takeaway order" posts to `POST
 * /api/takeaway/cart/items` — the same endpoint the cart review page will
 * use — and bootstraps its CSRF token from `GET /api/takeaway/cart`
 * (returns `{cart, totals, csrfToken}` in one call) rather than the generic
 * `/api/session/csrf`, matching that route's own documented intent.
 */

import { useEffect, useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import { formatPkr } from '../../../lib/business/money';
import type { MenuViewCategory } from '../../../modules/menu/menu-view';
import {
  resolveCategoryMedia,
  resolveGroupMedia,
  resolveItemThumb,
  menuItemMedia,
} from '../../../modules/menu/media-mapping';
import {
  FeatureMediaStage,
  categoryFeatureMedia,
  groupFeatureMedia,
  type FeatureMedia,
} from './feature-media-stage';
import { CategoryTabs } from './category-tabs';
import { ItemSelectorRail } from './item-selector-rail';
import { FeaturedItemDetails } from './featured-item-details';
import { useOverflowControls } from './use-overflow-controls';
import { usePointerTilt } from './use-pointer-tilt';

export interface MenuFeatureCarouselProps {
  readonly categories: readonly MenuViewCategory[];
  /**
   * Whether the takeaway journey is part of this release. Resolved on the
   * server from FEATURE_TAKEAWAY_REQUESTS and the guest-journey constant so
   * the add affordance never appears without somewhere for it to lead.
   */
  readonly takeawayEnabled: boolean;
  readonly locale: Locale;
}

interface CartTotalsState {
  readonly subtotalPkr: number;
  readonly lineCount: number;
}

async function parseApiError(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? null;
  } catch {
    return null;
  }
}

export function MenuFeatureCarousel({
  categories,
  takeawayEnabled,
  locale,
}: MenuFeatureCarouselProps) {
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [outgoingMedia, setOutgoingMedia] = useState<FeatureMedia | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  // Seeded from the server-resolved gate rather than assumed available and
  // corrected later, so the "ordering isn't available" note is correct on
  // first paint instead of appearing a moment after hydration.
  const [cartAvailable, setCartAvailable] = useState(takeawayEnabled);
  const [totals, setTotals] = useState<CartTotalsState | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  /*
   * Destructured rather than held as an object: once `ref` is handed to a
   * DOM node, `react-hooks/refs` treats every later read on the same object
   * as a ref access during render, including the plain `useState` booleans
   * beside it. Pulling the values out keeps the rule satisfied without
   * suppressing it.
   */
  const {
    ref: tabsScrollerRef,
    overflowing: tabsOverflowing,
    canScrollStart: tabsCanScrollStart,
    canScrollEnd: tabsCanScrollEnd,
    scrollByPage: scrollTabsByPage,
  } = useOverflowControls();
  const tiltRef = usePointerTilt<HTMLDivElement>();

  useEffect(() => {
    /*
     * When takeaway is not part of this release, the add affordance is off
     * deterministically — decided on the server from
     * `FEATURE_TAKEAWAY_REQUESTS` and passed in — rather than by letting a
     * bootstrap request fail and inferring it. Two reasons that matters:
     * the guest never sees an add control resolve from "maybe" to
     * "unavailable", and the page makes no request it already knows will
     * be refused.
     */
    if (!takeawayEnabled) return;

    let cancelled = false;
    fetch('/api/takeaway/cart')
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setCartAvailable(false);
          return;
        }
        const body = (await response.json()) as {
          csrfToken: string;
          totals: { subtotalPkr: number; lines: readonly unknown[] };
        };
        setCsrfToken(body.csrfToken);
        setTotals({ subtotalPkr: body.totals.subtotalPkr, lineCount: body.totals.lines.length });
      })
      .catch(() => {
        if (!cancelled) setCartAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [takeawayEnabled]);

  /*
   * Retire the outgoing dish on a timer rather than on animationend alone.
   *
   * animationend is not guaranteed to arrive. Under
   * prefers-reduced-motion the exit layer is display:none, which runs no
   * animation at all, so the event never fires and the outgoing media
   * stays in state forever - stale content that the next transition then
   * compares against. A backgrounded tab throttles animations to the same
   * effect. Observed directly: the previous category photograph was still
   * in the DOM more than a second after the change.
   *
   * The timeout is the authority and animationend is kept only as the
   * faster path, so the layer is cleaned up on every route including the
   * ones where nothing animates.
   */
  useEffect(() => {
    if (outgoingMedia === null) return;
    const timer = window.setTimeout(() => setOutgoingMedia(null), 400);
    return () => window.clearTimeout(timer);
  }, [outgoingMedia]);

  if (categories.length === 0) return null;

  const category = categories[categoryIndex] ?? categories[0]!;
  const items = category.items;
  const item = items[itemIndex] ?? items[0];

  function selectCategory(index: number) {
    if (index === categoryIndex) return;
    setDirection(index > categoryIndex ? 1 : -1);
    setOutgoingMedia(media);
    setCategoryIndex(index);
    setItemIndex(0);
    setVariantId(null);
  }

  function selectItem(index: number) {
    if (index === itemIndex) return;
    setDirection(index > itemIndex ? 1 : -1);
    const next = items[index];
    /*
     * Resolved through the same chain the render uses, not just the item
     * map. Once sub-group photography exists, moving between two items in
     * one category can genuinely change the picture — BBQ's Beef group to
     * its Chicken group does exactly that — and the exit layer has to know,
     * or the outgoing photo is dropped without its transition.
     */
    const nextSrc = next
      ? (menuItemMedia[next.id]?.assetPath ??
        resolveGroupMedia(category.mediaKey, next.groupLabel)?.assetPath ??
        resolveCategoryMedia(category.mediaKey)?.assetPath)
      : undefined;
    setOutgoingMedia(nextSrc !== media?.src ? media : null);
    setItemIndex(index);
    setVariantId(null);
  }

  async function addToOrder() {
    if (!item || !csrfToken || !cartAvailable) return;
    setAddError(null);
    try {
      const response = await fetch('/api/takeaway/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: item.id,
          variantId,
          quantity: 1,
          csrfToken,
        }),
      });
      if (!response.ok) {
        setAddError(
          (await parseApiError(response)) ?? chromeText('carouselOrderingUnavailableText', locale),
        );
        return;
      }
      const body = (await response.json()) as {
        totals: { subtotalPkr: number; lines: readonly unknown[] };
      };
      setTotals({ subtotalPkr: body.totals.subtotalPkr, lineCount: body.totals.lines.length });
      setConfirmation(`${chromeText('carouselAddedConfirmationText', locale)} — ${item.name}`);
    } catch {
      setAddError(chromeText('carouselOrderingUnavailableText', locale));
    }
  }

  if (!item) return null;

  const tabId = `menu-carousel-tab-${category.id}`;
  const panelId = `menu-carousel-panel-${category.id}`;
  /*
   * Most specific true statement wins: a photo of this dish, else a photo
   * of its sub-group, else a photo of the category. Each step down is a
   * weaker claim, never a false one, and `FeatureMediaStage` captions the
   * two weaker ones so a guest is told what they are looking at.
   */
  const exact = menuItemMedia[item.id];
  const media: FeatureMedia | null = exact
    ? {
        src: exact.assetPath,
        alt: exact.alt,
        width: exact.width,
        height: exact.height,
        provenance: 'item',
      }
    : (groupFeatureMedia(resolveGroupMedia(category.mediaKey, item.groupLabel)) ??
      categoryFeatureMedia(resolveCategoryMedia(category.mediaKey)));

  return (
    <section
      aria-label={chromeText('navMenuLabel', locale)}
      className="menu-carousel"
      data-direction={direction}
    >
      <div className="menu-carousel-tabs">
        {/*
         * Edge controls render only when the strip genuinely overflows, and
         * they are hidden from assistive technology: they scroll a region a
         * keyboard user already traverses with the tablist's own arrow
         * keys, so exposing them would add two redundant stops between the
         * tabs and the panel without reaching anything new.
         */}
        {tabsOverflowing ? (
          <button
            type="button"
            className="menu-carousel-tabs-edge menu-carousel-tabs-edge--start"
            aria-label={chromeText('carouselPreviousLabel', locale)}
            disabled={!tabsCanScrollStart}
            onClick={() => scrollTabsByPage(-1)}
          >
            <span className="menu-carousel-tabs-edge-glyph">&#8249;</span>
          </button>
        ) : null}

        <div className="menu-carousel-tabs-scroller" ref={tabsScrollerRef}>
          <CategoryTabs
            categories={categories}
            selectedIndex={categoryIndex}
            onSelect={selectCategory}
            detailsPanelId={panelId}
            locale={locale}
          />
        </div>

        {tabsOverflowing ? (
          <button
            type="button"
            className="menu-carousel-tabs-edge menu-carousel-tabs-edge--end"
            aria-label={chromeText('carouselNextLabel', locale)}
            disabled={!tabsCanScrollEnd}
            onClick={() => scrollTabsByPage(1)}
          >
            <span className="menu-carousel-tabs-edge-glyph">&#8250;</span>
          </button>
        ) : null}
      </div>

      <div className="menu-carousel-stage">
        <div className="menu-carousel-panel">
          {/*
           * `key` on the details and the stage is what drives the
           * transition: a new selection remounts them, replaying the CSS
           * entry animation. The details are keyed on the item, the stage
           * on the category, because the photograph only changes when the
           * category does — re-fading an identical image on every item
           * click would be movement that means nothing.
           */}
          <FeaturedItemDetails
            key={item.id}
            panelId={panelId}
            tabId={tabId}
            categoryName={category.name}
            item={item}
            selectedVariantId={variantId}
            onSelectVariant={setVariantId}
            onAddToOrder={() => void addToOrder()}
            /*
             * Hidden outright when takeaway is not in this release, rather
             * than shown disabled. A permanently dead control is still an
             * invitation — it suggests ordering is a thing this page nearly
             * does — and "View dish details" gives the panel a real action
             * in its place. When the journey is on, it behaves as before.
             */
            showAddToOrder={takeawayEnabled}
            addToOrderDisabled={!cartAvailable || !csrfToken}
            viewDetailsHref={`/${locale}/menu#menu-item-${item.id}`}
            locale={locale}
          />

          {/*
           * Keyed on the category so a category change remounts the rail.
           * Without it the rail kept the previous category's scroll offset
           * while the selection reset to the first item, leaving the
           * selected dish parked off the left edge with no indication that
           * it was there.
           */}
          <ItemSelectorRail
            key={category.id}
            items={items}
            selectedIndex={itemIndex}
            onSelect={selectItem}
            thumbFor={(railItem) => resolveItemThumb(railItem.id)}
            locale={locale}
          />

          {/*
           * Only worth saying when ordering was actually expected to work.
           * With the journey gated off there is no add control on screen,
           * so announcing that ordering is unavailable would be answering a
           * question the page never raised.
           */}
          {takeawayEnabled && !cartAvailable ? (
            <p role="status" className="menu-carousel-note">
              {chromeText('carouselOrderingUnavailableText', locale)}
            </p>
          ) : null}
          {addError ? (
            <p role="alert" className="menu-carousel-note">
              {addError}
            </p>
          ) : null}
          {totals ? (
            <p role="status" aria-live="polite" className="menu-carousel-note">
              {chromeText('carouselOrderItemCountLabel', locale)}: {totals.lineCount} &middot;{' '}
              {chromeText('carouselOrderSubtotalLabel', locale)}: {formatPkr(totals.subtotalPkr)}
            </p>
          ) : null}
          {confirmation ? (
            <p role="status" aria-live="polite" className="menu-carousel-visually-hidden">
              {confirmation}
            </p>
          ) : null}
        </div>

        <div className="menu-carousel-media" ref={tiltRef}>
          {outgoingMedia && outgoingMedia.src !== media?.src ? (
            <div
              key={`exit-${outgoingMedia.src}`}
              className="menu-carousel-media-exit"
              aria-hidden="true"
              onAnimationEnd={() => setOutgoingMedia(null)}
            >
              <FeatureMediaStage media={outgoingMedia} locale={locale} />
            </div>
          ) : null}
          <div key={media?.src ?? category.id} className="menu-carousel-media-enter">
            <FeatureMediaStage media={media} locale={locale} />
          </div>
        </div>
      </div>
    </section>
  );
}
