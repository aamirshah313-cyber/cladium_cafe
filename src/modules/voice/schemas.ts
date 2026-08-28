/**
 * Request-body schema for `POST /api/vapi/token` — Runbook Step 31.
 * Mirrors `modules/concierge/schemas.ts#chatMessageBodySchema`'s shape
 * exactly (`csrfToken` + a closed `locale` enum) — the same guest-mutating
 * request contract every route since Step 20 uses.
 */

import { z } from 'zod';
import { localeSchema, strictObject } from '../../lib/schemas/common';

export const vapiTokenRequestBodySchema = strictObject({
  locale: localeSchema,
  csrfToken: z.string().min(1).max(256),
});

export type VapiTokenRequestBody = z.infer<typeof vapiTokenRequestBodySchema>;
