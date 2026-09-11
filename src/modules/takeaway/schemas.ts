/**
 * Request body schemas for the takeaway API routes — Runbook Step 20.
 *
 * Every mutating body carries `csrfToken` explicitly (this is a JSON API,
 * not a form post) — `lib/http/session-route.ts`'s `guardStateChangingRequest`
 * verifies it against the caller's own session before any of these schemas
 * are even consulted for content, but the field still has to arrive in the
 * body for that check to have something to verify.
 */

import { z } from 'zod';
import {
  guestNameSchema,
  idempotencyKeySchema,
  notesSchema,
  phoneSchema,
  quantitySchema,
  sourceChannelSchema,
  strictObject,
  uuidSchema,
} from '../../lib/schemas/common';

const csrfTokenSchema = z.string().min(1).max(256);

/**
 * `menuItemId`/`variantId` are the menu rows' own uuids, not stable ids.
 * `modules/menu/guest-view-repository.ts` builds `MenuViewItem.id` from
 * `menu_items.id` and `MenuViewVariant.id` from `menu_variants.id`, and the
 * carousel posts exactly what it was given. `stableIdSchema` accepted those
 * only by accident — a lowercase uuid happens to satisfy its
 * `[a-z0-9][a-z0-9._-]*` pattern — so it validated the right values while
 * documenting the wrong contract, and would have gone on accepting a genuine
 * stable id that no adapter could resolve.
 *
 * `nullish`, not `optional`: an item with no variants posts `variantId: null`
 * rather than omitting the key, and `optional()` rejects an explicit null.
 * That mismatch made every add of a variant-less dish a 400 — which is most
 * of the menu — and it survived until the journey was driven through the
 * real control, because nothing between the button and the schema had ever
 * been exercised together.
 */
export const addItemBodySchema = strictObject({
  menuItemId: uuidSchema,
  variantId: uuidSchema.nullish(),
  quantity: quantitySchema,
  csrfToken: csrfTokenSchema,
});

export const modifyItemBodySchema = strictObject({
  quantity: quantitySchema,
  csrfToken: csrfTokenSchema,
});

export const removeItemBodySchema = strictObject({
  csrfToken: csrfTokenSchema,
});

const contactDetailsSchema = {
  guestName: guestNameSchema,
  guestPhone: phoneSchema,
  requestedCollectionNote: notesSchema.optional(),
  notes: notesSchema.optional(),
};

export const reviewBodySchema = strictObject({
  ...contactDetailsSchema,
  csrfToken: csrfTokenSchema,
});

export const submitBodySchema = strictObject({
  ...contactDetailsSchema,
  sourceChannel: sourceChannelSchema,
  confirmationToken: z.string().min(1).max(512),
  idempotencyKey: idempotencyKeySchema,
  csrfToken: csrfTokenSchema,
});
