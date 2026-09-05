'use client';

/**
 * Menu carousel featured item details — `design/menu-carousel-reference.md`'s
 * `FeaturedItemDetails`. Category label, item name, current price (or a
 * "Select size or option" prompt when a required variant isn't chosen
 * yet — never a guessed/calculated price), availability, a variant
 * picker when the item has more than one option, and the single primary
 * action.
 *
 * `shortDescription` from the spec is never rendered: neither
 * `menu.json` nor the `menu_items` schema has a populated description
 * field for any item today, so there is nothing approved to show — the
 * spec itself marks it optional.
 *
 * The action is always "Add to takeaway order" — the spec's alternate
 * "View dish" state would need an item-detail page this project doesn't
 * have; building one was out of scope for this pass (see the plan).
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
  readonly addToOrderDisabled: boolean;
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
  addToOrderDisabled,
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
      <h3 className="menu-carousel-item-name">{item.name}</h3>

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
        <div role="radiogroup" aria-label={chromeText('carouselSelectSizeLabel', locale)}>
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

      <button
        type="button"
        className="menu-carousel-add-button"
        disabled={
          addToOrderDisabled || requiresVariantChoice || item.availability === 'UNAVAILABLE'
        }
        onClick={onAddToOrder}
      >
        {chromeText('carouselAddToOrderLabel', locale)}
      </button>
    </div>
  );
}
