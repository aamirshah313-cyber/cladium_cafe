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
  stableIdSchema,
  strictObject,
} from '../../lib/schemas/common';

const csrfTokenSchema = z.string().min(1).max(256);

export const addItemBodySchema = strictObject({
  menuItemId: stableIdSchema,
  variantId: stableIdSchema.optional(),
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
