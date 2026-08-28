/**
 * Inbound Vapi webhook authentication — Runbook Step 32 (ADR-0006: "Vapi
 * tool/webhook calls are authenticated with a Custom Credential using
 * HMAC-SHA256, timestamp-freshness checks, constant-time signature
 * comparison, and replay rejection").
 *
 * Reuses `lib/security/webhook.ts`'s already-generalized, already-tested
 * primitives entirely — no new HMAC/timestamp/replay logic, only the
 * Vapi-specific header names and the fail-closed-on-unconfigured-secret
 * wiring. **The header names below (`x-vapi-timestamp`/`x-vapi-signature`)
 * are this codebase's own choice for a Custom Credential integration,
 * never verified against a live Vapi configuration** (the same standing
 * limitation `vapi-client.ts`/`vapi-webhook.ts` flag elsewhere) — confirm
 * against the real Vapi Custom Credential setup before this authenticates
 * live traffic; if Vapi's actual header names differ, only the two
 * constants below need to change.
 *
 * The replay-dedupe `eventId` is a SHA-256 hash of the raw request body
 * rather than a field pulled from the payload itself — robust regardless
 * of exactly which envelope fields Vapi sends, and correctly identifies "the
 * same signed delivery, resent byte-for-byte" as a replay by construction.
 */

import { createHash } from 'node:crypto';
import { parseVapiWebhookSecret } from '../../lib/env.server';
import {
  verifyWebhook,
  type ReplayStore,
  type WebhookVerificationResult,
} from '../../lib/security/webhook';

export const VAPI_WEBHOOK_TIMESTAMP_HEADER = 'x-vapi-timestamp';
export const VAPI_WEBHOOK_SIGNATURE_HEADER = 'x-vapi-signature';

/** 5 minutes — generous for real network latency, still short enough to make a captured-and-replayed request useless quickly. */
export const VAPI_WEBHOOK_MAX_AGE_SECONDS = 300;

export interface VerifyVapiWebhookInput {
  readonly rawBody: string;
  readonly timestampHeader: string | null | undefined;
  readonly signatureHeader: string | null | undefined;
  readonly replayStore: ReplayStore;
  readonly now?: Date;
  readonly envSource?: Record<string, string | undefined>;
}

export async function verifyVapiWebhookRequest(
  input: VerifyVapiWebhookInput,
): Promise<WebhookVerificationResult> {
  const secret = parseVapiWebhookSecret(input.envSource);
  if (!secret) return { ok: false, reason: 'BAD_SIGNATURE' };

  const eventId = createHash('sha256').update(input.rawBody).digest('hex');

  return verifyWebhook({
    payload: input.rawBody,
    signatureHeader: input.signatureHeader,
    timestampHeader: input.timestampHeader,
    secret,
    maxAgeSeconds: VAPI_WEBHOOK_MAX_AGE_SECONDS,
    eventId,
    replayStore: input.replayStore,
    now: input.now,
  });
}
