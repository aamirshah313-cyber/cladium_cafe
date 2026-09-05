/**
 * Pure route orchestration for the takeaway cart/review/submit flow —
 * Runbook Step 20.
 *
 * Every function here takes an already-*verified* `sessionId` (see
 * `lib/customer-session.ts`) and returns a `Result`; the actual Next.js
 * route handlers under `app/api/takeaway/` are thin glue that resolves the
 * session, applies the CSRF/origin/body-size guards, and maps the result to
 * an HTTP response — matching the split already used for `proxy.ts` and
 * `/api/locale-preference` (Step 13). Kept here, not inline in route files,
 * so this orchestration is unit-testable without a running server.
 *
 * A cart is looked up only by the caller's own verified `sessionId` — there
 * is no code path that accepts a caller-supplied cart or session ID for a
 * *different* session, which is what makes cross-session access structurally
 * impossible rather than a check to remember.
 */

import { err, ok, type Result } from '../../lib/result';
import { featureDisabled, notFound, validationFailed, type AppError } from '../../lib/errors';
import type { SourceChannel } from '../../lib/schemas/common';
import {
  addItemToCart,
  emptyCart,
  modifyCartItem,
  recomputeCartTotals,
  removeCartItem,
  type AddItemInput,
  type Cart,
  type CartTotals,
  type ModifyCartItemInput,
} from './cart';
import type { CartStore } from './cart-store';
import {
  prepareTakeawayRequest,
  submitTakeawayRequest,
  type PrepareTakeawayRequestResult,
  type SubmitTakeawayRequestResult,
  type TakeawayServiceDeps,
} from './submission-service';

export interface TakeawayHttpDeps extends TakeawayServiceDeps {
  readonly cartStore: CartStore;
}

export interface CartView {
  readonly cart: Cart;
  readonly totals: CartTotals;
}

async function loadOrCreateCart(deps: TakeawayHttpDeps, sessionId: string): Promise<Cart> {
  const existing = await deps.cartStore.get(sessionId);
  if (existing) return existing;
  const menuView = await deps.getMenuView();
  const versionNumber = menuView.status === 'PUBLISHED' ? menuView.versionNumber : 0;
  return emptyCart(deps.generateId(), sessionId, versionNumber);
}

async function loadExistingCart(
  deps: TakeawayHttpDeps,
  sessionId: string,
): Promise<Result<Cart, AppError>> {
  const cart = await deps.cartStore.get(sessionId);
  if (!cart) return err(notFound());
  return ok(cart);
}

async function requirePublishedMenu(deps: TakeawayHttpDeps): Promise<Result<void, AppError>> {
  const menuView = await deps.getMenuView();
  return menuView.status === 'PUBLISHED' ? ok(undefined) : err(featureDisabled());
}

export async function getCart(
  deps: TakeawayHttpDeps,
  sessionId: string,
): Promise<Result<CartView, AppError>> {
  const menuCheck = await requirePublishedMenu(deps);
  if (!menuCheck.ok) return menuCheck;

  const cart = await loadOrCreateCart(deps, sessionId);
  const totals = recomputeCartTotals(cart, await deps.getMenuView());
  if (!totals.ok) return totals;
  return ok({ cart, totals: totals.value });
}

export async function addItem(
  deps: TakeawayHttpDeps,
  sessionId: string,
  input: AddItemInput,
): Promise<Result<CartView, AppError>> {
  const menuCheck = await requirePublishedMenu(deps);
  if (!menuCheck.ok) return menuCheck;

  const cart = await loadOrCreateCart(deps, sessionId);
  const menuView = await deps.getMenuView();
  const updated = addItemToCart(cart, menuView, input);
  if (!updated.ok) return updated;

  await deps.cartStore.save(updated.value);
  const totals = recomputeCartTotals(updated.value, menuView);
  if (!totals.ok) return totals;
  return ok({ cart: updated.value, totals: totals.value });
}

export async function modifyItem(
  deps: TakeawayHttpDeps,
  sessionId: string,
  input: ModifyCartItemInput,
): Promise<Result<CartView, AppError>> {
  const menuCheck = await requirePublishedMenu(deps);
  if (!menuCheck.ok) return menuCheck;

  const cartResult = await loadExistingCart(deps, sessionId);
  if (!cartResult.ok) return cartResult;

  const updated = modifyCartItem(cartResult.value, input);
  if (!updated.ok) return updated;

  await deps.cartStore.save(updated.value);
  const menuView = await deps.getMenuView();
  const totals = recomputeCartTotals(updated.value, menuView);
  if (!totals.ok) return totals;
  return ok({ cart: updated.value, totals: totals.value });
}

export async function removeItem(
  deps: TakeawayHttpDeps,
  sessionId: string,
  cartLineId: string,
): Promise<Result<CartView, AppError>> {
  const menuCheck = await requirePublishedMenu(deps);
  if (!menuCheck.ok) return menuCheck;

  const cartResult = await loadExistingCart(deps, sessionId);
  if (!cartResult.ok) return cartResult;

  const updated = removeCartItem(cartResult.value, cartLineId);
  if (!updated.ok) return updated;

  await deps.cartStore.save(updated.value);
  const menuView = await deps.getMenuView();
  const totals = recomputeCartTotals(updated.value, menuView);
  if (!totals.ok) return totals;
  return ok({ cart: updated.value, totals: totals.value });
}

export interface ReviewTakeawayHttpInput {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedCollectionNote?: string | null;
  readonly notes?: string | null;
}

/** The guest's contact/pickup details are collected here, at review time — not earlier. */
export async function reviewTakeaway(
  deps: TakeawayHttpDeps,
  sessionId: string,
  input: ReviewTakeawayHttpInput,
): Promise<Result<PrepareTakeawayRequestResult, AppError>> {
  const cartResult = await loadExistingCart(deps, sessionId);
  if (!cartResult.ok) return cartResult;
  if (cartResult.value.lines.length === 0) {
    return err(validationFailed([{ path: 'cart', code: 'empty_cart' }]));
  }

  return prepareTakeawayRequest(deps, { sessionId, cart: cartResult.value, ...input });
}

export interface SubmitTakeawayHttpInput extends ReviewTakeawayHttpInput {
  readonly sourceChannel: SourceChannel;
  readonly confirmationToken: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

/** Clears the cart only after a successful submission — a failed attempt (e.g. `STALE_REVIEW`) leaves it intact so the guest can review again. */
export async function submitTakeaway(
  deps: TakeawayHttpDeps,
  sessionId: string,
  input: SubmitTakeawayHttpInput,
): Promise<Result<SubmitTakeawayRequestResult, AppError>> {
  const cartResult = await loadExistingCart(deps, sessionId);
  if (!cartResult.ok) return cartResult;

  const result = await submitTakeawayRequest(deps, { sessionId, cart: cartResult.value, ...input });
  if (result.ok) await deps.cartStore.clear(sessionId);
  return result;
}
