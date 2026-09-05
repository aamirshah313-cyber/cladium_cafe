'use client';

/**
 * Menu feature carousel — `design/menu-carousel-reference.md`'s
 * `MenuFeatureCarousel`, wiring `CategoryTabs`, `FeaturedItemDetails`,
 * `ItemSelectorRail`, and the already-built `FeatureMediaStage`
 * (`modules/menu/media-mapping.ts`, previously staff-only, live to guests
 * for the first time here) together over the real published menu.
 *
 * An editorial discovery feature, not the sole way to browse — `menu/
 * page.tsx` renders this above its own existing search/filter list, which
 * is completely unchanged. Uses the *unfiltered* `categories` prop, not
 * the text-search-filtered list, since this has its own independent
 * category-tab browsing model.
 *
 * **The takeaway add action is gated on `takeawayEnabled`, resolved on the
 * server from `FEATURE_TAKEAWAY_REQUESTS`.** The cart/review destination it
 * would lead to is not built yet (tracked separately), so with the flag off
 * — its state for this release — the control is not rendered at all and an
 * honest note says ordering is unavailable while browsing still works. The
 * whole rest of the carousel (category tabs, item rail, prices, imagery) is
 * unaffected: this is a browsing feature that can optionally order, not an
 * ordering feature.
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
import { resolveCategoryMedia } from '../../../modules/menu/media-mapping';
import { FeatureMediaStage } from './feature-media-stage';
import { CategoryTabs } from './category-tabs';
import { ItemSelectorRail } from './item-selector-rail';
import { FeaturedItemDetails } from './featured-item-details';

export interface MenuFeatureCarouselProps {
  readonly categories: readonly MenuViewCategory[];
  /**
   * Whether the takeaway journey is part of this release. Resolved on the
   * server from FEATURE_TAKEAWAY_REQUESTS so the add affordance never
   * appears without somewhere for it to lead.
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
  const [variantId, setVariantId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  // Seeded from the server-resolved gate rather than assumed available and
  // corrected later, so the "ordering isn't available" note is correct on
  // first paint instead of appearing a moment after hydration.
  const [cartAvailable, setCartAvailable] = useState(takeawayEnabled);
  const [totals, setTotals] = useState<CartTotalsState | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    /*
     * When takeaway is not part of this release, the add affordance is off
     * deterministically — decided on the server from
     * `FEATURE_TAKEAWAY_REQUESTS` and passed in — rather than by letting a
     * bootstrap request fail and inferring it. Two reasons that matters:
     * the guest never sees an add control resolve from "maybe" to
     * "unavailable", and the page makes no request it already knows will
     * be refused.
     *
     * It also closes the real dead end: if the flag were switched on while
     * the cart/review page is still unbuilt, a guest could add items and
     * watch a subtotal climb with nowhere to submit it. `takeawayEnabled`
     * is the single switch that turns the whole journey on, so it cannot
     * come on before there is somewhere for it to lead.
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

  if (categories.length === 0) return null;

  const category = categories[categoryIndex] ?? categories[0]!;
  const items = category.items;
  const item = items[itemIndex] ?? items[0];

  function selectCategory(index: number) {
    setCategoryIndex(index);
    setItemIndex(0);
    setVariantId(null);
  }

  function selectItem(index: number) {
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

  return (
    <section aria-label={chromeText('navMenuLabel', locale)} className="menu-carousel">
      <CategoryTabs
        categories={categories}
        selectedIndex={categoryIndex}
        onSelect={selectCategory}
        detailsPanelId={panelId}
        locale={locale}
      />

      <div className="menu-carousel-stage">
        <div className="menu-carousel-panel">
          <FeaturedItemDetails
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
             * does — and the note below states the position in words
             * instead. When the journey is on, it behaves exactly as before.
             */
            showAddToOrder={takeawayEnabled}
            addToOrderDisabled={!cartAvailable || !csrfToken}
            locale={locale}
          />

          <ItemSelectorRail
            items={items}
            selectedIndex={itemIndex}
            onSelect={selectItem}
            locale={locale}
          />

          {!cartAvailable ? (
            <p role="status">{chromeText('carouselOrderingUnavailableText', locale)}</p>
          ) : null}
          {addError ? <p role="alert">{addError}</p> : null}
          {totals ? (
            <p role="status" aria-live="polite">
              {chromeText('carouselOrderItemCountLabel', locale)}: {totals.lineCount} ·{' '}
              {chromeText('carouselOrderSubtotalLabel', locale)}: {formatPkr(totals.subtotalPkr)}
            </p>
          ) : null}
          {confirmation ? (
            <p role="status" aria-live="polite" className="menu-carousel-visually-hidden">
              {confirmation}
            </p>
          ) : null}
        </div>

        <div className="menu-carousel-media">
          <FeatureMediaStage
            categoryName={category.name}
            media={resolveCategoryMedia(category.mediaKey)}
          />
        </div>
      </div>
    </section>
  );
}
