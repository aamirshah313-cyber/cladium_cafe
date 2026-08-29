/**
 * Append-only consent ledger entry — Runbook Step 36 (data-model-v2.md
 * `consent_events`: "Session/customer reference, consent category, policy
 * version, grant/revoke state, timestamp, source, and proof metadata.
 * Categories are distinct: essential preferences, Meta marketing,
 * microphone, and recording.").
 *
 * Same shape/pattern as `status-event.ts`: a pure builder, `now` injectable
 * only for deterministic tests. Written through `AppendOnlySink<ConsentEvent>`
 * (`sink.ts`, Step 19) exactly like `status_events`/`audit_events` — every
 * ordinary write is genuinely append-only, matching the real Postgres
 * table's `consent_events_append_only` trigger (Step 9). The one legitimate
 * exception, retention-window deletion, is a narrow, separate capability
 * (`modules/consent/consent-store.ts#purgeExpiredBefore`) never exposed
 * through this builder or the plain sink interface.
 */

import type { ConsentCategory } from '../schemas/common';

export interface ConsentEvent {
  readonly sessionId: string;
  readonly category: ConsentCategory;
  readonly granted: boolean;
  readonly policyVersion: string;
  /** Free-text origin of this event, e.g. `"privacy_page"`, `"voice_panel"`. Never PII. */
  readonly source: string;
  /** Non-identifying proof metadata only (data-model-v2.md) — never a name, phone number, or free-form note. */
  readonly proof: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface BuildConsentEventInput {
  readonly sessionId: string;
  readonly category: ConsentCategory;
  readonly granted: boolean;
  readonly policyVersion: string;
  readonly source: string;
  readonly proof?: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly now?: () => Date;
}

export function buildConsentEvent(input: BuildConsentEventInput): ConsentEvent {
  const now = input.now ?? (() => new Date());
  return {
    sessionId: input.sessionId,
    category: input.category,
    granted: input.granted,
    policyVersion: input.policyVersion,
    source: input.source,
    proof: input.proof ?? {},
    correlationId: input.correlationId,
    occurredAt: now().toISOString(),
  };
}
