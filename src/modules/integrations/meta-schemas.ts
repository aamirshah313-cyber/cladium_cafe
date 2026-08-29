/**
 * Request body schema for `POST /api/meta/track` — Runbook Step 37. Same
 * `csrfToken`-carrying JSON-body convention as `modules/consent/schemas.ts`.
 */

import { z } from 'zod';
import { metaEventNameSchema, strictObject } from '../../lib/schemas/common';

const csrfTokenSchema = z.string().min(1).max(256);

/** A safe, non-PII relative page path only — no query string, no fragment, no protocol/host. */
const metaEventSourcePathSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/[a-z]{2}(\/[a-z0-9-]+)*$/, 'Invalid path.')
  .optional();

export const trackMetaEventBodySchema = strictObject({
  eventName: metaEventNameSchema,
  eventSourceUrl: metaEventSourcePathSchema,
  csrfToken: csrfTokenSchema,
});
export type TrackMetaEventBody = z.infer<typeof trackMetaEventBodySchema>;
