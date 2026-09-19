/**
 * Request body schema for `POST /api/telemetry/vitals`.
 *
 * Unlike every other guest-mutating body in this codebase there is no
 * `csrfToken` field, and that is deliberate — `app/api/telemetry/vitals/
 * route.ts` documents the full reasoning. The short version: a CSRF token
 * is derived from a guest session, and minting a session cookie for every
 * visitor purely to report a page-load timing would collect *more* about
 * them than the telemetry itself does. The route substitutes a strict
 * trusted-origin check for the token.
 *
 * `strictObject` (shared) rejects unknown keys, so a client cannot append
 * extra fields and have them silently ignored on the way to a table whose
 * whole premise is that it stores nothing identifying.
 */

import { z } from 'zod';
import { strictObject } from '../../lib/schemas/common';
import {
  MAX_REPORTED_VIEWPORT_WIDTH,
  VITALS_METRICS,
  VITALS_NAVIGATION_TYPES,
  VITALS_RATINGS,
} from './vitals-sample';

/**
 * CLS is a small unitless ratio, every other metric is milliseconds; one
 * bound covers both. The ceiling matches the `web_vitals_samples.value`
 * check constraint exactly, so a value the database would reject is
 * rejected here first with a field-level validation error rather than
 * surfacing as a 500 from a constraint violation.
 */
const vitalsValueSchema = z.number().finite().min(0).max(600_000);

/**
 * A relative path only — no protocol, host, query string, or fragment.
 * Deliberately stricter than the shape of any real route on this site
 * (`resolveRoutePattern` reduces it to one of eight tokens anyway), because
 * the narrowest thing that can express every real pathname is the right
 * bound for a field a browser controls.
 */
const vitalsPathnameSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/, 'Invalid path.');

export const reportVitalsBodySchema = strictObject({
  metric: z.enum(VITALS_METRICS),
  value: vitalsValueSchema,
  rating: z.enum(VITALS_RATINGS),
  navigationType: z.enum(VITALS_NAVIGATION_TYPES),
  pathname: vitalsPathnameSchema,
  viewportWidth: z.number().int().min(0).max(MAX_REPORTED_VIEWPORT_WIDTH),
});
export type ReportVitalsBody = z.infer<typeof reportVitalsBodySchema>;
