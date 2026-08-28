/**
 * Process-lifetime deps binding for voice — Runbook Steps 31–32. Mirrors
 * `modules/concierge/deps.ts#orchestratorDeps` exactly: real, typechecked
 * provider adapters (never live-called in this sandbox — no
 * `VAPI_PRIVATE_KEY`/`VAPI_WEBHOOK_HMAC_SECRET`), in-memory rate-limit/
 * idempotency/replay stores (dev-only, same D-023 caveat as every other
 * in-memory adapter here), and the redacted `consoleLogger`.
 */

import { createVapiTokenIssuer } from '../integrations/vapi-client';
import { createInMemoryRateLimiter } from '../../lib/security/rate-limit';
import { createInMemoryReplayStore } from '../../lib/security/webhook';
import { createInMemoryIdempotencyStore } from '../../lib/domain/idempotency';
import { createLogger } from '../../lib/logging';
import type { IssueVapiTokenDeps } from './token/issue-vapi-token';
import type { ExecuteVapiToolCallsDeps } from './tools/execute-vapi-tool-calls';

export const voiceTokenDeps: IssueVapiTokenDeps = {
  issuer: createVapiTokenIssuer(),
  rateLimiter: createInMemoryRateLimiter(),
  logger: createLogger(),
};

/** Shared by both `/api/vapi/tools` (replay dedupe on the raw signed payload) and, in future, any other Vapi webhook needing the same guarantee. */
export const vapiWebhookReplayStore = createInMemoryReplayStore();

export const executeVapiToolCallsDeps: ExecuteVapiToolCallsDeps = {
  idempotencyStore: createInMemoryIdempotencyStore(),
};

export const voiceLogger = createLogger();
