/**
 * Request body schemas for the staff API — Runbook Step 24.
 *
 * `newState` is a hand-picked enum of the states a staff action can ever
 * target — never the full state list from each `state-machine.ts` (which
 * also includes `DRAFT`/`REQUESTED`, the guest-creation-only states no
 * staff transition ever targets, and for events, `CUSTOMER_ACCEPTED`, which
 * is guest-performed — data-model-v2.md §5). This is defense-in-depth on
 * top of `canTransition`'s own table, not a replacement for it: an
 * out-of-order but in-list target (e.g. `COLLECTED` from `REQUESTED`) still
 * fails inside `performStaffTransition`, not here.
 */

import { z } from 'zod';
import { strictObject } from '../../lib/schemas/common';

const csrfTokenSchema = z.string().min(1).max(256);
const reasonCodeSchema = z.string().trim().min(1).max(100);
const reasonNoteSchema = z.string().trim().max(500);
const assignedStaffIdSchema = z.string().trim().min(1).max(128).nullable();

export const staffSignInBodySchema = strictObject({
  staffId: z.string().trim().min(1).max(128),
  devPassword: z.string().min(1).max(256),
});

export const takeawayTransitionBodySchema = strictObject({
  expectedVersion: z.number().int().min(1),
  newState: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'REJECTED', 'CANCELLED']),
  reasonCode: reasonCodeSchema.optional(),
  reasonNote: reasonNoteSchema.optional(),
  csrfToken: csrfTokenSchema,
});

export const bookingTransitionBodySchema = strictObject({
  expectedVersion: z.number().int().min(1),
  newState: z.enum(['CONFIRMED', 'SEATED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'NO_SHOW']),
  reasonCode: reasonCodeSchema.optional(),
  reasonNote: reasonNoteSchema.optional(),
  csrfToken: csrfTokenSchema,
});

export const eventTransitionBodySchema = strictObject({
  expectedVersion: z.number().int().min(1),
  newState: z.enum(['QUOTED', 'CONFIRMED', 'CANCELLED']),
  quotedAmountPkr: z.number().int().min(0).optional(),
  reasonCode: reasonCodeSchema.optional(),
  reasonNote: reasonNoteSchema.optional(),
  csrfToken: csrfTokenSchema,
}).refine((body) => body.newState !== 'QUOTED' || body.quotedAmountPkr !== undefined, {
  message: 'A quote amount is required to set this event to QUOTED.',
  path: ['quotedAmountPkr'],
});

export const staffAssignBodySchema = strictObject({
  expectedVersion: z.number().int().min(1),
  assignedStaffId: assignedStaffIdSchema,
  csrfToken: csrfTokenSchema,
});
