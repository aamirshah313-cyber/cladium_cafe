'use client';

/**
 * Menu carousel featured item details — `design/menu-carousel-reference.md`'s
 * `FeaturedItemDetails`. Category label, item name, current price (or a
 * "Select size or option" prompt when a required variant isn't chosen
 * yet — never a guessed/calculated price), availability, a variant
 * picker when the item has more than one option, and the primary action.
 *
 * `shortDescription` from the spec is never rendered: neither
 * `menu.json` nor the `menu_items` schema has a populated description
 * field for any item today, so there is nothing approved to show — the
 * spec itself marks it optional.
 *
 * ## The panel always offers a real action
 *
 * Previously the only action was "Add to takeaway order", which is hidden
 * for this release because the cart/review screen a guest would need next
 * does not exist (`modules/takeaway/guest-journey.ts`). That left the panel
 * with no action at all — an editorial feature that showed a dish and then
 * asked nothing of the reader.
 *
 * So the spec's alternate "View dish" state is implemented here, as a link
 * into the item's row in the full menu list further down the same page.
 * That is a destination that genuinely exists rather than an item-detail
 * page this project still does not have, and it works with JavaScript off,
 * is linkable, and keeps the carousel honest about what it can do.
 *
 * When the takeaway journey is complete, both actions are offered: adding
 * is the primary, viewing the row is the quieter secondary.
 */

import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import { formatPkr } from '../../../lib/business/money';
import { availabilityChromeKey } from '../../../modules/menu/availability-chrome-key';
import type { MenuViewItem } from '../../../modules/menu/menu-view';

export interface FeaturedItemDetailsProps {
  readonly panelId: string;
  readonly tabId: string;
  readonly categoryName: string;
  readonly item: MenuViewItem;
  readonly selectedVariantId: string | null;
  readonly onSelectVariant: (variantId: string) => void;
  readonly onAddToOrder: () => void;
  /** False when takeaway is not part of this release — the control is then not rendered at all. */
  readonly showAddToOrder: boolean;
  readonly addToOrderDisabled: boolean;
  /** Anchor into this item's row in the full menu list below. */
  readonly viewDetailsHref: string;
  readonly locale: Locale;
}

export function FeaturedItemDetails({
  panelId,
  tabId,
  categoryName,
  item,
  selectedVariantId,
  onSelectVariant,
  onAddToOrder,
  showAddToOrder,
  addToOrderDisabled,
  viewDetailsHref,
  locale,
}: FeaturedItemDetailsProps) {
  const selectedVariant = item.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const requiresVariantChoice = item.variants.length > 0 && !selectedVariant;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      tabIndex={-1}
      className="menu-carousel-details"
    >
      <p className="menu-carousel-category-label">{categoryName}</p>
      {/*
       * Marked as English explicitly. Menu item names are canonical English
       * (CLAUDE.md forbids inventing Urdu for them), so on an Urdu page the
       * inherited Nastaliq stack would be asked to set Latin text - it
       * falls back, but only after the tight Nastaliq line box has already
       * been applied, and the two-line name then overflowed its box by 33px
       * into the price beneath it. Declaring the real language fixes both
       * the font selection and the metrics, and is what a screen reader
       * needs in order to pronounce it.
       */}
      <h3 className="menu-carousel-item-name" lang="en" dir="ltr">
        {item.name}
      </h3>

      <p className="menu-carousel-price">
        {item.variants.length === 0
          ? item.basePricePkr !== null
            ? formatPkr(item.basePricePkr)
            : null
          : selectedVariant
            ? formatPkr(selectedVariant.pricePkr)
            : chromeText('carouselSelectSizeLabel', locale)}
      </p>

      <p className="menu-carousel-availability">
        {chromeText(availabilityChromeKey(item.availability), locale)}
      </p>

      {item.variants.length > 0 ? (
        <div
          role="radiogroup"
          aria-label={chromeText('carouselSelectSizeLabel', locale)}
          className="menu-carousel-variants"
        >
          {item.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={variant.id === selectedVariantId}
              className="menu-carousel-variant-option"
              onClick={() => onSelectVariant(variant.id)}
            >
              {variant.label} — {formatPkr(variant.pricePkr)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="menu-carousel-actions">
        {showAddToOrder ? (
          <button
            type="button"
            className="u-button u-button--primary"
            disabled={
              addToOrderDisabled || requiresVariantChoice || item.availability === 'UNAVAILABLE'
            }
            onClick={onAddToOrder}
          >
            {chromeText('carouselAddToOrderLabel', locale)}
          </button>
        ) : null}

        {/*
         * A plain anchor, not a button: it navigates to a real fragment in
         * the list below, so it survives JavaScript being off, can be
         * opened in a new tab, and can be copied as a link. The href drops
         * any active search/filter query deliberately — the target row is
         * only guaranteed to be on the page in the unfiltered list.
         */}
        <a
          href={viewDetailsHref}
          className={showAddToOrder ? 'u-button u-button--secondary' : 'u-button u-button--primary'}
        >
          {chromeText('carouselViewDishDetailsLabel', locale)}
        </a>
      </div>
    </div>
  );
}
