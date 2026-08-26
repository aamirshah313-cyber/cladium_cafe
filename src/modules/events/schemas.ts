/**
 * Request body schemas for the event/birthday API routes — Runbook Step 23.
 *
 * Same shape as `modules/bookings/schemas.ts`, sharing its date-in-the-past
 * refinement (`lib/business/request-window.ts`'s `isTodayOrFutureDate`).
 * `decorInterest` is a plain boolean flag — it never computes or promises a
 * price; the approved starting figure (PKR 8,000) is display-only copy from
 * `modules/business/facts.ts`'s `BIRTHDAY_POLICY_TEXT`, and only a staff
 * `QUOTED` transition (not built here — see `state-machine.ts`) ever sets a
 * real amount.
 */

import { z } from 'zod';
import {
  guestCountSchema,
  guestNameSchema,
  idempotencyKeySchema,
  notesSchema,
  occasionSchema,
  phoneSchema,
  requestedDateSchema,
  requestedTimeSchema,
  sourceChannelSchema,
  strictObject,
} from '../../lib/schemas/common';
import { isTodayOrFutureDate } from '../../lib/business/request-window';

const csrfTokenSchema = z.string().min(1).max(256);

const eventDraftFieldsSchema = {
  guestName: guestNameSchema,
  guestPhone: phoneSchema,
  occasion: occasionSchema,
  requestedDate: requestedDateSchema.refine((value) => isTodayOrFutureDate(value, new Date()), {
    message: 'Choose today or a future date.',
  }),
  requestedTime: requestedTimeSchema,
  guestCount: guestCountSchema,
  decorInterest: z.boolean(),
  notes: notesSchema.optional(),
};

export const eventReviewBodySchema = strictObject({
  ...eventDraftFieldsSchema,
  csrfToken: csrfTokenSchema,
});

export const eventSubmitBodySchema = strictObject({
  ...eventDraftFieldsSchema,
  sourceChannel: sourceChannelSchema,
  confirmationToken: z.string().min(1).max(512),
  idempotencyKey: idempotencyKeySchema,
  csrfToken: csrfTokenSchema,
});
