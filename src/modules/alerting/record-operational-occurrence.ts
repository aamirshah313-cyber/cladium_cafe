/**
 * The single entry point for recording an operational occurrence. Every
 * instrumented call site goes through here — there is no second path that
 * writes to `operational_counters`.
 *
 * ## This runs on the request path, so it must be invisible
 *
 * Three guarantees, in the order they matter:
 *
 *   1. **It never throws.** A counter write failing must not turn a working
 *      booking submission into a 500. Every failure becomes a `warn` and a
 *      `false` return.
 *   2. **It never blocks the response.** `recordOperationalOccurrence` is
 *      awaited by callers that can afford it; `recordOperationalOccurrenceAsync`
 *      is the fire-and-forget form for hot paths, and deliberately returns
 *      `void` so a caller cannot accidentally `await` it and reintroduce
 *      the latency.
 *   3. **It refuses an unknown label.** `isOperationalLabel` is checked
 *      here rather than trusted from the caller, because a typo'd label
 *      silently splits a rate's denominator in two — see
 *      `operational-event.ts` on why that is worse than it sounds. A
 *      rejected label is a `warn`, not a throw: the bug is worth seeing,
 *      but not worth failing a guest's request over.
 *
 * The asymmetry with `recordVitalsSample` is deliberate. Telemetry loses a
 * data point when it fails; a counter loses the denominator of something
 * that decides whether anyone is told about an incident. Same swallowing,
 * louder logging.
 */

import type { Logger } from '../../lib/logging';
import {
  isOperationalLabel,
  type OperationalKind,
  type OperationalLabel,
  type OperationalOutcome,
} from './operational-event';
import type { AlertStore } from './alert-store';

export interface RecordOccurrenceDeps {
  readonly store: AlertStore;
  readonly logger: Logger;
  readonly now?: () => Date;
}

export async function recordOperationalOccurrence(
  deps: RecordOccurrenceDeps,
  kind: OperationalKind,
  label: OperationalLabel,
  outcome: OperationalOutcome,
): Promise<boolean> {
  if (!isOperationalLabel(kind, label)) {
    deps.logger.warn('alerting.occurrence.unknown_label', { kind, label, outcome });
    return false;
  }

  try {
    await deps.store.increment({ kind, label, outcome }, deps.now?.() ?? new Date());
    return true;
  } catch (error) {
    deps.logger.warn('alerting.occurrence.record_failed', {
      kind,
      label,
      outcome,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return false;
  }
}

/**
 * Fire-and-forget form. Returns `void` rather than a floating promise so
 * that a caller on a latency-sensitive path cannot await it by accident —
 * the rejection is already handled inside `recordOperationalOccurrence`, so
 * there is no unhandled rejection to leak.
 */
export function recordOperationalOccurrenceAsync(
  deps: RecordOccurrenceDeps,
  kind: OperationalKind,
  label: OperationalLabel,
  outcome: OperationalOutcome,
): void {
  void recordOperationalOccurrence(deps, kind, label, outcome);
}
