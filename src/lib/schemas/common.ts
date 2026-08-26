/**
 * Shared schema primitives.
 *
 * Business facts are NOT encoded here — no menu items, prices, hours, or
 * policies. This module only constrains *shape*; the authoritative values
 * come from the database/menu adapter at runtime.
 */

import { z } from 'zod';

/** Launch locales. Urdu renders RTL; both are mandatory. */
export const localeSchema = z.enum(['en', 'ur']);
export type Locale = z.infer<typeof localeSchema>;

export const themeSchema = z.enum(['day', 'night']);
export type Theme = z.infer<typeof themeSchema>;

/** Money is integer PKR everywhere — never a float (data-model-v2.md §1). */
export const integerPkrSchema = z
  .number()
  .int('Amounts must be whole rupees.')
  .nonnegative('Amounts cannot be negative.');

export const quantitySchema = z.number().int().min(1).max(99);

export const partySizeSchema = z.number().int().min(1).max(200);

export const seatingPreferenceSchema = z.enum(['GENERAL', 'TREEHOUSE']);
export type SeatingPreference = z.infer<typeof seatingPreferenceSchema>;

export const availabilityStatusSchema = z.enum(['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN']);
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;

/** Who performed a state transition or wrote an audit/status event (data-model-v2.md §6). */
export const actorTypeSchema = z.enum(['GUEST', 'STAFF', 'SYSTEM']);
export type ActorType = z.infer<typeof actorTypeSchema>;

/** data-model-v2.md §6 `staff_profiles`: initial roles. */
export const staffRoleSchema = z.enum([
  'OWNER',
  'MANAGER',
  'ORDER_STAFF',
  'BOOKING_STAFF',
  'AUDITOR',
]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** Where a request/session originated — recorded on submissions, never inferred after the fact. */
export const sourceChannelSchema = z.enum([
  'WEB',
  'TEXT_CONCIERGE',
  'VOICE_EN',
  'VOICE_UR',
  'STAFF',
]);
export type SourceChannel = z.infer<typeof sourceChannelSchema>;

/** Minimal PII: a display name only, with a strict length bound. */
export const guestNameSchema = z.string().trim().min(2).max(80);

/**
 * Pakistani mobile number in local or +92 form. Deliberately permissive about
 * separators and strict about length; the owner has not yet confirmed the
 * canonical format to display, so this validates shape only.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+92|0)[\s-]?3\d{2}[\s-]?\d{7}$/, 'Enter a valid Pakistani mobile number.');

/** Free-form notes are length-capped and excluded from analytics/logs. */
export const notesSchema = z.string().trim().max(500);

/** Client-generated key that makes a submission safely retryable. */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Idempotency keys must be URL-safe.');

/** Opaque server-issued identifiers. */
export const uuidSchema = z.uuid();

/** Stable menu identifiers from the import adapter (not sequential integers). */
export const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Invalid identifier.');

/**
 * Every request body schema must be built with this. Strict objects reject
 * unknown keys instead of silently dropping them, which is what makes
 * over-posting a validation failure rather than a silent no-op.
 */
export const strictObject = z.strictObject;

/** Preference cookie payload — non-sensitive by design. */
export const preferencesSchema = z.strictObject({
  locale: localeSchema,
  theme: themeSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;
