/**
 * Server-held "last prepared draft" per voice session — Runbook Step 33.
 *
 * A live voice call's tool execution happens entirely server-to-server
 * (`/api/vapi/tools`, Step 32) — the browser tab driving the call has no
 * direct way to see a `prepareBookingRequest`/`prepareEventRequest` result
 * the way `orchestrateTurn` returns one inline for text chat. This store is
 * the bridge: `execute-vapi-tool-calls.ts` writes the prepared draft here
 * keyed by session id, and `GET /api/vapi/pending-confirmation`
 * (session-cookie-authenticated, the same session id the browser's own
 * `POST /api/vapi/token` call and `vapi.start(..., {metadata:{sessionId}})`
 * use) lets `voice-panel.tsx` poll for it — the same "poll the durably-held
 * server-side result" pattern Step 25 already established for staff
 * notifications (D-029: "Realtime is a speed-up, not the delivery
 * guarantee").
 *
 * "Only the latest prepare call wins" (Step 28's rule for one text turn)
 * applies here too, at session granularity: a newer `set()` always replaces
 * whatever was stored before, matching `orchestrator.ts`'s own semantics.
 *
 * Dev-only, in-memory — same D-023 caveat as every other in-memory adapter
 * in this codebase. A short TTL (not a hard security boundary, just
 * hygiene) keeps a draft from a call the guest never returned to from
 * lingering forever in process memory.
 */

import type { PendingConfirmation } from '../concierge/prepare-tool-result';

export const PENDING_CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StoredEntry {
  readonly value: PendingConfirmation;
  readonly expiresAt: number;
}

export interface PendingConfirmationStore {
  set(sessionId: string, value: PendingConfirmation, now: Date): void;
  get(sessionId: string, now: Date): PendingConfirmation | null;
  clear(sessionId: string): void;
}

export function createInMemoryPendingConfirmationStore(
  ttlMs: number = PENDING_CONFIRMATION_TTL_MS,
): PendingConfirmationStore {
  const entries = new Map<string, StoredEntry>();

  return {
    set(sessionId, value, now) {
      entries.set(sessionId, { value, expiresAt: now.getTime() + ttlMs });
    },
    get(sessionId, now) {
      const entry = entries.get(sessionId);
      if (!entry) return null;
      if (now.getTime() >= entry.expiresAt) {
        entries.delete(sessionId);
        return null;
      }
      return entry.value;
    },
    clear(sessionId) {
      entries.delete(sessionId);
    },
  };
}
