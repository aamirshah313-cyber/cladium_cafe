/**
 * WhatsApp Cloud API webhook verification — Runbook Step 38.
 *
 * Two distinct, unrelated secrets, matching Meta's own real documented
 * webhook contract (confirmed against Meta's current public webhook
 * docs, not a guess — same "verify the real shape" bar Step 33 applied
 * to Vapi):
 *
 * - `verifyWhatsAppWebhookChallenge`: the one-time `GET` subscription
 *   handshake Meta performs when a webhook URL is first configured —
 *   `hub.mode`/`hub.verify_token`/`hub.challenge` query params, checked
 *   against `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Unrelated to message
 *   signing; this token is chosen by us and typed into Meta's dashboard.
 * - `verifyWhatsAppWebhookSignature`: every subsequent `POST` delivery
 *   carries an `X-Hub-Signature-256: sha256=<hex>` header — plain
 *   HMAC-SHA256 over the *raw* request body (no timestamp component,
 *   unlike Vapi's `lib/security/webhook.ts` scheme — Meta's contract
 *   genuinely differs, so this is its own function, never a forced reuse
 *   of the Vapi verifier), keyed by `WHATSAPP_APP_SECRET`.
 *
 * Both fail closed on any malformed/missing input — never throw, so a
 * route can treat every return value as a plain boolean/nullable
 * decision without a try/catch.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { assertServerOnly } from '../../lib/server-only';

assertServerOnly('src/modules/integrations/whatsapp-webhook-auth.ts');

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Verifies `X-Hub-Signature-256` against the raw request body. `signatureHeader` is the full header value, including the `sha256=` prefix. */
export function verifyWhatsAppWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret) return false;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const provided = signatureHeader.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return constantTimeEqual(provided, expected);
}

export interface WhatsAppWebhookChallengeQuery {
  readonly mode: string | null;
  readonly verifyToken: string | null;
  readonly challenge: string | null;
}

/** Returns the raw `hub.challenge` value to echo back on success, or `null` if the handshake should be rejected. */
export function verifyWhatsAppWebhookChallenge(
  query: WhatsAppWebhookChallengeQuery,
  configuredVerifyToken: string | undefined,
): string | null {
  if (!configuredVerifyToken) return null;
  if (query.mode !== 'subscribe') return null;
  if (!query.verifyToken || !constantTimeEqual(query.verifyToken, configuredVerifyToken)) {
    return null;
  }
  if (!query.challenge) return null;
  return query.challenge;
}
