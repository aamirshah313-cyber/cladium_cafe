/**
 * Request body schemas for the booking API routes — Runbook Step 22.
 *
 * `requestedDate`'s "not in the past" check is a `.refine()` against the
 * real clock — deliberately not unit-testable at the schema level (the
 * testable, injectable-`now` version is `request-window.ts`'s
 * `isTodayOrFutureDate`, exercised directly). This refinement exists so a
 * request that's already stale on arrival fails at the boundary with a
 * field-level issue, not deeper inside the domain service.
 */

import { z } from 'zod';
import {
  guestNameSchema,
  idempotencyKeySchema,
  notesSchema,
  partySizeSchema,
  phoneSchema,
  requestedDateSchema,
  requestedTimeSchema,
  seatingPreferenceSchema,
  sourceChannelSchema,
  strictObject,
} from '../../lib/schemas/common';
import { isTodayOrFutureDate } from './request-window';

const csrfTokenSchema = z.string().min(1).max(256);

const bookingDraftFieldsSchema = {
  guestName: guestNameSchema,
  guestPhone: phoneSchema,
  requestedDate: requestedDateSchema.refine((value) => isTodayOrFutureDate(value, new Date()), {
    message: 'Choose today or a future date.',
  }),
  requestedTime: requestedTimeSchema,
  partySize: partySizeSchema,
  seatingPreference: seatingPreferenceSchema,
  notes: notesSchema.optional(),
};

export const bookingReviewBodySchema = strictObject({
  ...bookingDraftFieldsSchema,
  csrfToken: csrfTokenSchema,
});

export const bookingSubmitBodySchema = strictObject({
  ...bookingDraftFieldsSchema,
  sourceChannel: sourceChannelSchema,
  confirmationToken: z.string().min(1).max(512),
  idempotencyKey: idempotencyKeySchema,
  csrfToken: csrfTokenSchema,
});
