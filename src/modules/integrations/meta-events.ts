/**
 * Consent-gated Meta event dispatch — Runbook Step 37.
 *
 * `trackMetaEvent` is the single decision point every trigger site in this
 * codebase calls through — never a route or form re-deriving the flag/
 * consent check itself. In order:
 *
 * 1. `FEATURE_META_MARKETING` off → nothing is sent, no consent lookup even
 *    runs (same "flag checked before consent" order Step 36's
 *    `issue-vapi-token.ts` established for MICROPHONE).
 * 2. `META_MARKETING` consent (`modules/consent/consent-service.ts#hasConsent`,
 *    Step 36) not granted for the session → nothing is sent. "consent-denied
 *    sends nothing" (Step 37's own evidence bullet) is enforced here,
 *    structurally, not left to each call site to remember.
 * 3. Otherwise: generate one `eventId`, send it through `MetaEventClient`
 *    (CAPI) racing a bounded timeout so a slow/unreachable Meta endpoint
 *    can never block the guest-facing request that triggered it — the
 *    same "never let a third-party call hang the response" reasoning
 *    `execute-vapi-tool-calls.ts`'s `TOOL_CALL_TIMEOUT_MS` uses (Step 32).
 *
 * The returned `eventId` is handed back to the browser regardless of
 * whether the CAPI call itself actually succeeded (`sent: true` once
 * flag+consent allow proceeding, decoupled from network outcome) — Pixel
 * and CAPI are independent reporting channels sharing one id purely for
 * Meta-side dedupe; if CAPI fails, the browser Pixel call (still using the
 * same id) is a safe, non-duplicating fallback, never a double-count risk
 * either way.
 *
 * `TrackMetaEventInput` structurally cannot carry a guest name, phone,
 * note, or any other free-text field — only a closed-enum `eventName` and
 * an optional page path — so "never send PII" (`production-architecture-
 * v2.md` §11) is a type-level guarantee here, the same pattern
 * `lib/business/whatsapp-link.ts#buildWhatsAppUrl`'s locale-only signature
 * already established for the WhatsApp prefilled message (Step 35).
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from '../../lib/logging';
import type { MetaEventName } from '../../lib/schemas/common';
import type { MetaEventClient } from './meta-client';

export const META_EVENT_TIMEOUT_MS = 3000;

export interface TrackMetaEventDeps {
  readonly client: MetaEventClient;
  readonly isFeatureEnabled: () => boolean;
  /** Bound to `'META_MARKETING'` at the call site — never a raw category param here. */
  readonly hasConsent: (sessionId: string) => Promise<boolean>;
  readonly logger: Logger;
  readonly generateEventId?: () => string;
  readonly now?: () => Date;
}

export interface TrackMetaEventInput {
  readonly eventName: MetaEventName;
  readonly sessionId: string;
  /** A safe, non-PII page path only, e.g. `/en/menu` — never a query string. */
  readonly eventSourceUrl?: string;
  readonly correlationId?: string;
}

export interface TrackMetaEventResult {
  readonly sent: boolean;
  /** Non-null exactly when `sent` is true — the id the browser Pixel call should reuse for dedupe. */
  readonly eventId: string | null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('meta event send timed out')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function trackMetaEvent(
  deps: TrackMetaEventDeps,
  input: TrackMetaEventInput,
): Promise<TrackMetaEventResult> {
  if (!deps.isFeatureEnabled()) return { sent: false, eventId: null };

  const consented = await deps.hasConsent(input.sessionId);
  if (!consented) return { sent: false, eventId: null };

  const now = deps.now ?? (() => new Date());
  const eventId = (deps.generateEventId ?? randomUUID)();

  try {
    await withTimeout(
      deps.client.sendEvent({
        eventName: input.eventName,
        eventId,
        occurredAt: now(),
        eventSourceUrl: input.eventSourceUrl,
      }),
      META_EVENT_TIMEOUT_MS,
    );
  } catch (error) {
    // Best-effort: a failed/slow Meta call never fails the guest-facing
    // action that triggered it. Never log the raw error — same "type
    // name only" reasoning as orchestrator.ts's/issue-vapi-token.ts's
    // catch blocks.
    deps.logger.warn('meta.event_send_failed', {
      correlationId: input.correlationId,
      eventName: input.eventName,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
  }

  return { sent: true, eventId };
}
