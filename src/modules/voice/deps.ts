/**
 * Process-lifetime deps binding for voice — Runbook Step 31. Mirrors
 * `modules/concierge/deps.ts#orchestratorDeps` exactly: a real, typechecked
 * provider adapter (never live-called in this sandbox — no
 * `VAPI_PRIVATE_KEY`), an in-memory rate limiter (dev-only, same D-023
 * caveat as every other in-memory adapter here), and the redacted
 * `consoleLogger`.
 */

import { createVapiTokenIssuer } from '../integrations/vapi-client';
import { createInMemoryRateLimiter } from '../../lib/security/rate-limit';
import { createLogger } from '../../lib/logging';
import type { IssueVapiTokenDeps } from './token/issue-vapi-token';

export const voiceTokenDeps: IssueVapiTokenDeps = {
  issuer: createVapiTokenIssuer(),
  rateLimiter: createInMemoryRateLimiter(),
  logger: createLogger(),
};
