/**
 * Provider-neutral webhook verification.
 *
 * Constant-time HMAC-SHA256 over a `timestamp.payload` string, timestamp
 * freshness to bound the replay window, and a `ReplayStore` interface so a
 * caller can reject a previously-seen event ID. This generalizes the Vapi
 * tool/webhook contract in production-architecture-v2.md §7 ("HMAC-SHA256,
 * validate timestamp freshness, compare signatures in constant time, and
 * reject replays") to any provider (Supabase, WhatsApp, Meta) that signs
 * webhooks the same way; a provider with a different signature scheme gets
 * its own adapter later, not a change to this contract.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/security/webhook.ts');

export type WebhookVerificationFailureReason =
  'MISSING_TIMESTAMP' | 'STALE_TIMESTAMP' | 'MISSING_SIGNATURE' | 'BAD_SIGNATURE' | 'REPLAYED';

export type WebhookVerificationResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: WebhookVerificationFailureReason };

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function signWebhookPayload(payload: string, timestamp: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

export interface WebhookSignatureInput {
  readonly payload: string;
  readonly signatureHeader: string | null | undefined;
  readonly timestampHeader: string | null | undefined;
  readonly secret: string;
  /** Freshness bound in seconds, e.g. 300. Required — there is no implicit default, matching the launch flag convention of failing loudly rather than picking a silent value. */
  readonly maxAgeSeconds: number;
  readonly now?: Date;
}

export function verifyWebhookSignature(input: WebhookSignatureInput): WebhookVerificationResult {
  if (!input.timestampHeader) return { ok: false, reason: 'MISSING_TIMESTAMP' };
  const timestampSeconds = Number(input.timestampHeader);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: 'MISSING_TIMESTAMP' };

  const now = input.now ?? new Date();
  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds);
  if (ageSeconds > input.maxAgeSeconds) return { ok: false, reason: 'STALE_TIMESTAMP' };

  if (!input.signatureHeader) return { ok: false, reason: 'MISSING_SIGNATURE' };
  const expectedSignature = signWebhookPayload(input.payload, input.timestampHeader, input.secret);
  if (!constantTimeEqual(input.signatureHeader, expectedSignature)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  return { ok: true };
}

/** Dedupe contract mirroring the `webhook_events` uniqueness on `(provider, provider_event_id)` from data-model-v2.md. */
export interface ReplayStore {
  /** Records `eventId` and returns true if this is the first time it has been seen; returns false (without re-recording) if it is a replay. */
  recordIfNew(eventId: string): Promise<boolean>;
}

/** Development-only in-process substitute. Not durable across restarts or multiple instances — production must supply a store backed by `webhook_events`. */
export function createInMemoryReplayStore(): ReplayStore {
  const seen = new Set<string>();
  return {
    async recordIfNew(eventId) {
      if (seen.has(eventId)) return false;
      seen.add(eventId);
      return true;
    },
  };
}

export interface VerifyWebhookInput extends WebhookSignatureInput {
  readonly eventId: string;
  readonly replayStore: ReplayStore;
}

/** Combines signature/timestamp verification with replay-ID dedupe. Replay is checked last, so a forged request never consumes a legitimate event ID's dedupe slot. */
export async function verifyWebhook(input: VerifyWebhookInput): Promise<WebhookVerificationResult> {
  const signatureResult = verifyWebhookSignature(input);
  if (!signatureResult.ok) return signatureResult;

  const isNew = await input.replayStore.recordIfNew(input.eventId);
  if (!isNew) return { ok: false, reason: 'REPLAYED' };

  return { ok: true };
}
