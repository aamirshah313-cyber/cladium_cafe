/**
 * Takeaway cart — Runbook Step 19 (data-model-v2.md `carts`/`cart_items`).
 *
 * "Short-lived takeaway drafts. Items reference a published menu version
 * and variant. The server validates quantities and recomputes totals;
 * client totals are display hints only." Every function here is pure and
 * validates against a `PublishedMenuView` snapshot (`modules/menu/menu-view.ts`)
 * — nothing here trusts a client-supplied price or name. An `UNAVAILABLE`
 * item cannot be added; `UNKNOWN` can (that is exactly what "ask staff to
 * confirm availability" already tells the guest — Step 17), but never
 * `UNAVAILABLE`, which is a confirmed no.
 */

import { err, ok, type Result } from '../../lib/result';
import { notFound, validationFailed, type AppError } from '../../lib/errors';
import type { MenuViewItem, PublishedMenuView } from '../menu/menu-view';

export interface CartLine {
  readonly id: string;
  readonly menuItemId: string;
  readonly variantId: string | null;
  readonly quantity: number;
}

export interface Cart {
  readonly id: string;
  readonly sessionId: string;
  readonly menuVersionNumber: number;
  readonly lines: readonly CartLine[];
}

export function emptyCart(id: string, sessionId: string, menuVersionNumber: number): Cart {
  return { id, sessionId, menuVersionNumber, lines: [] };
}

function findMenuItem(view: PublishedMenuView, menuItemId: string): MenuViewItem | null {
  if (view.status !== 'PUBLISHED') return null;
  for (const category of view.categories) {
    const item = category.items.find((candidate) => candidate.id === menuItemId);
    if (item) return item;
  }
  return null;
}

/** Validates an item/variant pair against the menu — the one check every cart mutation shares. */
function resolveUnitPrice(item: MenuViewItem, variantId: string | null): Result<number, AppError> {
  if (item.availability === 'UNAVAILABLE') {
    return err(validationFailed([{ path: 'menuItemId', code: 'item_unavailable' }]));
  }

  if (item.variants.length === 0) {
    if (variantId !== null) {
      return err(validationFailed([{ path: 'variantId', code: 'item_has_no_variants' }]));
    }
    if (item.basePricePkr === null)
      return err(validationFailed([{ path: 'menuItemId', code: 'no_price' }]));
    return ok(item.basePricePkr);
  }

  const variant = item.variants.find((candidate) => candidate.id === variantId);
  if (!variant) return err(validationFailed([{ path: 'variantId', code: 'required_choice' }]));
  return ok(variant.pricePkr);
}

export interface AddItemInput {
  readonly menuItemId: string;
  readonly variantId?: string | null;
  readonly quantity: number;
}

export function addItemToCart(
  cart: Cart,
  menuView: PublishedMenuView,
  input: AddItemInput,
): Result<Cart, AppError> {
  const item = findMenuItem(menuView, input.menuItemId);
  if (!item) return err(notFound());

  const priceResult = resolveUnitPrice(item, input.variantId ?? null);
  if (!priceResult.ok) return priceResult;

  const lineId = `${input.menuItemId}:${input.variantId ?? 'single'}`;
  const existing = cart.lines.find((line) => line.id === lineId);
  const newQuantity = (existing?.quantity ?? 0) + input.quantity;
  const quantityCheck = checkQuantity(newQuantity);
  if (!quantityCheck.ok) return quantityCheck;

  const lines = existing
    ? cart.lines.map((line) => (line.id === lineId ? { ...line, quantity: newQuantity } : line))
    : [
        ...cart.lines,
        {
          id: lineId,
          menuItemId: input.menuItemId,
          variantId: input.variantId ?? null,
          quantity: newQuantity,
        },
      ];

  return ok({ ...cart, lines });
}

function checkQuantity(quantity: number): Result<number, AppError> {
  // Mirrors lib/schemas/common.ts's quantitySchema bounds (1..99) without a
  // hard dependency on zod here — this module stays a plain-object domain
  // layer; the HTTP boundary is where quantitySchema itself is applied.
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return err(validationFailed([{ path: 'quantity', code: 'out_of_range' }]));
  }
  return ok(quantity);
}

export interface ModifyCartItemInput {
  readonly cartLineId: string;
  readonly quantity: number;
}

export function modifyCartItem(cart: Cart, input: ModifyCartItemInput): Result<Cart, AppError> {
  const existing = cart.lines.find((line) => line.id === input.cartLineId);
  if (!existing) return err(notFound());

  const quantityCheck = checkQuantity(input.quantity);
  if (!quantityCheck.ok) return quantityCheck;

  const lines = cart.lines.map((line) =>
    line.id === input.cartLineId ? { ...line, quantity: input.quantity } : line,
  );
  return ok({ ...cart, lines });
}

export function removeCartItem(cart: Cart, cartLineId: string): Result<Cart, AppError> {
  if (!cart.lines.some((line) => line.id === cartLineId)) return err(notFound());
  return ok({ ...cart, lines: cart.lines.filter((line) => line.id !== cartLineId) });
}

export interface CartLineTotal {
  readonly cartLineId: string;
  readonly menuItemId: string;
  readonly name: string;
  readonly variantLabel: string | null;
  readonly unitPricePkr: number;
  readonly quantity: number;
  readonly lineTotalPkr: number;
}

export interface CartTotals {
  readonly lines: readonly CartLineTotal[];
  readonly subtotalPkr: number;
}

/**
 * The server-authoritative recomputation data-model-v2.md requires — never
 * trust a client-supplied total. Also used, unchanged, as step 3 of the
 * submission transaction contract ("reload published menu/version and
 * recompute integer totals").
 */
export function recomputeCartTotals(
  cart: Cart,
  menuView: PublishedMenuView,
): Result<CartTotals, AppError> {
  const lines: CartLineTotal[] = [];

  for (const cartLine of cart.lines) {
    const item = findMenuItem(menuView, cartLine.menuItemId);
    if (!item) return err(notFound());

    const priceResult = resolveUnitPrice(item, cartLine.variantId);
    if (!priceResult.ok) return priceResult;

    const variantLabel = cartLine.variantId
      ? (item.variants.find((v) => v.id === cartLine.variantId)?.label ?? null)
      : null;

    lines.push({
      cartLineId: cartLine.id,
      menuItemId: item.id,
      name: item.name,
      variantLabel,
      unitPricePkr: priceResult.value,
      quantity: cartLine.quantity,
      lineTotalPkr: priceResult.value * cartLine.quantity,
    });
  }

  const subtotalPkr = lines.reduce((sum, line) => sum + line.lineTotalPkr, 0);
  return ok({ lines, subtotalPkr });
}
