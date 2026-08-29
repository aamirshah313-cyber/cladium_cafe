/**
 * Request body schema for `POST /api/consent` — Runbook Step 36. Same
 * `csrfToken`-carrying JSON-body convention as `modules/takeaway/schemas.ts`.
 */

import { z } from 'zod';
import { consentCategorySchema, strictObject } from '../../lib/schemas/common';

const csrfTokenSchema = z.string().min(1).max(256);

/** Where the grant/revoke was made — never a free-text field, so it can never carry PII. */
export const consentSourceSchema = z.enum(['privacy_page', 'voice_panel']);

export const recordConsentBodySchema = strictObject({
  category: consentCategorySchema,
  granted: z.boolean(),
  source: consentSourceSchema,
  csrfToken: csrfTokenSchema,
});
export type RecordConsentBody = z.infer<typeof recordConsentBodySchema>;
