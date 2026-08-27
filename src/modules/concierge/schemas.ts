/**
 * Strict tool-input schemas for the read-only concierge tools — Runbook
 * Step 26 (`agent/tool-contracts.md`'s "Read-only tools" table). Every
 * schema rejects unknown properties (`strictObject`) — the model selects a
 * tool but cannot smuggle an extra field past validation.
 *
 * `viewCartInputSchema` is deliberately empty: `tool-contracts.md` for
 * `viewCart` is explicit — "no browser-supplied session ID; use
 * authenticated server context" — so the model supplies nothing at all;
 * the server injects the caller's own verified session ID, the same
 * server-only mechanism `lib/customer-session.ts` already provides.
 */

import { z } from 'zod';
import { stableIdSchema, strictObject, uuidSchema } from '../../lib/schemas/common';

export const getMenuInputSchema = strictObject({
  query: z.string().trim().min(1).max(100).optional(),
  category: stableIdSchema.optional(),
  itemId: stableIdSchema.optional(),
});
export type GetMenuInput = z.infer<typeof getMenuInputSchema>;

/** Mirrors exactly the policy facts `modules/business/facts.ts` has approved text for — an unlisted topic is a validation failure, not a null result. */
export const venueInfoTopicSchema = z.enum([
  'HOURS',
  'DIRECTIONS',
  'CONTACT',
  'SEATING',
  'DELIVERY',
  'BIRTHDAY_DECOR',
  'CAKES',
  'OUTSIDE_FOOD',
]);
export type VenueInfoTopic = z.infer<typeof venueInfoTopicSchema>;

export const getVenueInfoInputSchema = strictObject({ topic: venueInfoTopicSchema });
export type GetVenueInfoInput = z.infer<typeof getVenueInfoInputSchema>;

/** Empty on purpose — see module doc comment. */
export const viewCartInputSchema = strictObject({});
export type ViewCartInput = z.infer<typeof viewCartInputSchema>;

export const getRequestStatusInputSchema = strictObject({ requestId: uuidSchema });
export type GetRequestStatusInput = z.infer<typeof getRequestStatusInputSchema>;
