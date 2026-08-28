/**
 * Strict tool-input schemas for the concierge — Step 26's read-only tools
 * (`agent/tool-contracts.md`'s "Read-only tools" table) plus Step 28's two
 * draft-preparation tools. Every schema rejects unknown properties
 * (`strictObject`) — the model selects a tool but cannot smuggle an extra
 * field past validation.
 *
 * `viewCartInputSchema` is deliberately empty: `tool-contracts.md` for
 * `viewCart` is explicit — "no browser-supplied session ID; use
 * authenticated server context" — so the model supplies nothing at all;
 * the server injects the caller's own verified session ID, the same
 * server-only mechanism `lib/customer-session.ts` already provides.
 *
 * `prepareBookingInputSchema`/`prepareEventInputSchema` reuse the exact
 * field validators `modules/{bookings,events}/schemas.ts` already export
 * for the manual forms — same "not in the past" date check, same phone/
 * name/notes bounds — so a guest describing a request to the concierge is
 * held to the identical standard as one filling in `/book`/`/event`
 * directly, never a looser one. There is no `prepareTakeawayRequest` tool
 * yet: it needs a cart, and the menu is still `UNPUBLISHED` (D-021), the
 * same reason the manual takeaway UI is deferred (D-024) — nothing to
 * prepare a takeaway draft from exists yet, on either path.
 */

import { z } from 'zod';
import { localeSchema, stableIdSchema, strictObject, uuidSchema } from '../../lib/schemas/common';
import { bookingDraftFieldsSchema } from '../bookings/schemas';
import { eventDraftFieldsSchema } from '../events/schemas';

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

export const prepareBookingInputSchema = strictObject({ ...bookingDraftFieldsSchema });
export type PrepareBookingInput = z.infer<typeof prepareBookingInputSchema>;

export const prepareEventInputSchema = strictObject({ ...eventDraftFieldsSchema });
export type PrepareEventInput = z.infer<typeof prepareEventInputSchema>;

/**
 * `POST /api/concierge/chat`'s body — Runbook Step 27. `locale` comes from
 * the page the chat widget is embedded on (the same locale that page
 * already resolved), never guessed server-side; the orchestrator only
 * ever accepts one new message per call — the rest of the conversation is
 * server-held state (`conversation-store.ts`), never client-supplied.
 */
export const chatMessageBodySchema = strictObject({
  message: z.string().trim().min(1).max(2000),
  locale: localeSchema,
  csrfToken: z.string().min(1).max(256),
});
export type ChatMessageBody = z.infer<typeof chatMessageBodySchema>;
