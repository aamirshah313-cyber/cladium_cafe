/**
 * Consent grant/revoke and read service — Runbook Step 36.
 *
 * `recordConsent` appends one `ConsentEvent` (never updates/removes an
 * earlier one — the ledger stays a genuine history). `getConsentSnapshot`
 * folds that history into "what's true right now" per category: the
 * latest event wins, and a category with no recorded event yet falls back
 * to `CONSENT_DEFAULT_GRANTED` — this is what makes `ESSENTIAL_PREFERENCES`
 * work for a guest who has never opened `/privacy` at all, and what makes
 * `META_MARKETING`/`MICROPHONE`/`RECORDING` fail closed (not granted)
 * until an explicit event says otherwise. `hasConsent` is the one
 * primitive other modules should import to gate a real feature — Step
 * 37's Meta adapter ("analytics blocking") and `issue-vapi-token.ts`'s
 * microphone check both call this, never re-derive the logic themselves.
 */

import { buildConsentEvent, type ConsentEvent } from '../../lib/domain/consent-event';
import type { ConsentCategory } from '../../lib/schemas/common';
import type { ConsentEventStore } from './consent-store';
import { CONSENT_DEFAULT_GRANTED, CONSENT_POLICY_VERSION } from './policy';

export interface ConsentServiceDeps {
  readonly store: ConsentEventStore;
  readonly now?: () => Date;
}

export interface RecordConsentInput {
  readonly sessionId: string;
  readonly category: ConsentCategory;
  readonly granted: boolean;
  /** Free-text origin, e.g. `"privacy_page"`, `"voice_panel"`. Never PII. */
  readonly source: string;
  readonly proof?: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
}

export interface ConsentCategoryState {
  readonly category: ConsentCategory;
  readonly granted: boolean;
  readonly policyVersion: string;
  /** `null` when nothing was ever recorded for this category — the value is a fallback default, not a real event. */
  readonly recordedAt: string | null;
  /** True when the last recorded grant was under an earlier `CONSENT_POLICY_VERSION` — the guest should be asked again. Always false for a never-recorded (default) category. */
  readonly stale: boolean;
}

export type ConsentSnapshot = Readonly<Record<ConsentCategory, ConsentCategoryState>>;

const ALL_CATEGORIES: readonly ConsentCategory[] = [
  'ESSENTIAL_PREFERENCES',
  'META_MARKETING',
  'MICROPHONE',
  'RECORDING',
];

export async function recordConsent(
  deps: ConsentServiceDeps,
  input: RecordConsentInput,
): Promise<ConsentEvent> {
  const now = deps.now ?? (() => new Date());
  const event = buildConsentEvent({
    sessionId: input.sessionId,
    category: input.category,
    granted: input.granted,
    policyVersion: CONSENT_POLICY_VERSION,
    source: input.source,
    proof: input.proof,
    correlationId: input.correlationId,
    now,
  });
  await deps.store.append(event);
  return event;
}

function latestPerCategory(
  events: readonly ConsentEvent[],
  sessionId: string,
): Map<ConsentCategory, ConsentEvent> {
  const latest = new Map<ConsentCategory, ConsentEvent>();
  for (const event of events) {
    if (event.sessionId !== sessionId) continue;
    const current = latest.get(event.category);
    if (!current || event.occurredAt >= current.occurredAt) latest.set(event.category, event);
  }
  return latest;
}

export async function getConsentSnapshot(
  deps: ConsentServiceDeps,
  sessionId: string,
): Promise<ConsentSnapshot> {
  const events = await deps.store.list();
  const latest = latestPerCategory(events, sessionId);

  const snapshot: Record<ConsentCategory, ConsentCategoryState> = {} as Record<
    ConsentCategory,
    ConsentCategoryState
  >;
  for (const category of ALL_CATEGORIES) {
    const event = latest.get(category);
    snapshot[category] = event
      ? {
          category,
          granted: event.granted,
          policyVersion: event.policyVersion,
          recordedAt: event.occurredAt,
          stale: event.policyVersion !== CONSENT_POLICY_VERSION,
        }
      : {
          category,
          granted: CONSENT_DEFAULT_GRANTED[category],
          policyVersion: CONSENT_POLICY_VERSION,
          recordedAt: null,
          stale: false,
        };
  }
  return snapshot;
}

/** The fail-closed check other modules should import to gate a real feature on one category. */
export async function hasConsent(
  deps: ConsentServiceDeps,
  sessionId: string,
  category: ConsentCategory,
): Promise<boolean> {
  const snapshot = await getConsentSnapshot(deps, sessionId);
  return snapshot[category].granted;
}
