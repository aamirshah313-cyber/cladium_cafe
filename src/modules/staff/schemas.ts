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

/**
 * Real sign-in — Step 45 (D-049). `mode` selects the request shape
 * explicitly rather than being inferred from server config: a `password`
 * body always attempts a real Supabase sign-in, an `mfa` body always
 * attempts to complete a pending challenge/enrollment against whatever the
 * signed `cladium_staff_mfa_pending` cookie says — in an environment with
 * no Supabase project configured, that attempt simply fails closed
 * (`modules/staff/supabase-directory.ts`'s own fail-closed contract), it is
 * never a way to bypass anything.
 */
export const staffSignInPasswordBodySchema = strictObject({
  mode: z.literal('password'),
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});

export const staffSignInMfaBodySchema = strictObject({
  mode: z.literal('mfa'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
});

export const staffSignInRealBodySchema = z.discriminatedUnion('mode', [
  staffSignInPasswordBodySchema,
  staffSignInMfaBodySchema,
]);

/** `POST /api/staff/mfa/enroll/verify` — `/enroll/start` needs no body, the pending cookie already carries everything. */
export const staffMfaEnrollVerifyBodySchema = strictObject({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
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

/** Import needs no fields beyond CSRF: the content is menu.json itself, not anything the caller supplies. */
export const menuImportBodySchema = strictObject({
  csrfToken: csrfTokenSchema,
});

export const menuApproveBodySchema = strictObject({
  expectedVersion: z.number().int().min(1),
  csrfToken: csrfTokenSchema,
});

export const menuPublishBodySchema = strictObject({
  csrfToken: csrfTokenSchema,
});
