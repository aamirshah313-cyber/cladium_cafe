/**
 * The alert evaluation job: gather numbers, judge them with `evaluate.ts`,
 * record what fired, and hand each firing to the existing outbox so staff
 * actually hear about it.
 *
 * ## Delivery reuses the outbox rather than adding a channel
 *
 * A fired alert is enqueued as an ordinary outbox event with destination
 * `staff_notification` — the same pipeline that already delivers new
 * bookings (D-085, D-087). That buys, for free, everything a new channel
 * would have had to reinvent: durability across instance recycles, retry
 * with backoff, terminal-failure handling, and one place staff look.
 *
 * It also has an honest limit, recorded here rather than buried: this is a
 * dashboard someone has to open. Nobody is paged at 3am. An outbound
 * webhook adapter is the obvious next step and is deliberately not built —
 * it needs an owner-supplied endpoint, and inventing one would be exactly
 * the kind of unapproved integration `CLAUDE.md` gates.
 *
 * ## Cooldown is checked before enqueueing, not after
 *
 * `evaluatePopulation` consults the last firing time, so a condition that
 * persists across evaluation runs produces one notification per cooldown
 * window rather than one per run. Without it a systemic outbox failure —
 * which by definition lasts longer than one cron interval — would bury the
 * staff queue under copies of itself, and the queue is where real guest
 * requests live.
 *
 * The evaluation itself is read-only until something actually fires, so a
 * run that finds nothing wrong writes nothing at all.
 */

import { buildOutboxEvent } from '../../lib/domain/outbox';
import type { OutboxStore } from '../../lib/domain/outbox-store';
import type { Logger } from '../../lib/logging';
import type { AlertStore } from './alert-store';
import {
  evaluateThreshold,
  firingsOf,
  populationsFromTotals,
  type AlertEvaluation,
  type AlertPopulation,
} from './evaluate';
import { ALERT_THRESHOLDS, type AlertThreshold } from './thresholds';

/** Dispatched-vs-permanently-failed totals for the outbox-backed threshold. */
export interface OutboxDispatchTotals {
  readonly failed: number;
  /** Everything that reached a terminal state in the window — the denominator. */
  readonly dispatched: number;
}

export interface RunAlertEvaluationDeps {
  readonly store: AlertStore;
  readonly outbox: OutboxStore;
  readonly outboxTotalsSince: (since: Date) => Promise<OutboxDispatchTotals>;
  readonly logger: Logger;
  /** Injected, not imported, so a test gets deterministic ids — same shape as every submission service. */
  readonly generateId: () => string;
  readonly now?: () => Date;
  /** Overridable so a test can evaluate one threshold in isolation. */
  readonly thresholds?: readonly AlertThreshold[];
}

export interface AlertEvaluationSummary {
  readonly evaluatedAt: string;
  readonly thresholdsEvaluated: number;
  readonly firedCount: number;
  /** Keys that fired this run, for the cron response. Never the evidence — that is in `alert_firings`. */
  readonly firedKeys: readonly string[];
}

async function populationsFor(
  threshold: AlertThreshold,
  since: Date,
  deps: RunAlertEvaluationDeps,
): Promise<readonly AlertPopulation[]> {
  if (threshold.source.type === 'outbox') {
    const totals = await deps.outboxTotalsSince(since);
    // A single unlabelled population: "the outbox" is one thing, unlike
    // guest routes which the report explicitly evaluates individually.
    return [{ label: null, numerator: totals.failed, denominator: totals.dispatched }];
  }
  return populationsFromTotals(threshold.source, await deps.store.totalsSince(since));
}

function notificationPayload(evaluation: AlertEvaluation): Record<string, unknown> {
  // Safe projection only — counts and rates, never a guest identifier, a
  // payload, or an error string. Same rule the outbox payload already
  // follows everywhere else.
  return {
    alertKey: evaluation.threshold.key,
    summary: evaluation.threshold.summary,
    label: evaluation.population.label,
    windowSeconds: evaluation.threshold.windowSeconds,
    observedRate: Number(evaluation.observedRate.toFixed(4)),
    thresholdRate: evaluation.threshold.rate,
    numerator: evaluation.population.numerator,
    denominator: evaluation.population.denominator,
  };
}

export async function runAlertEvaluation(
  deps: RunAlertEvaluationDeps,
): Promise<AlertEvaluationSummary> {
  const now = deps.now?.() ?? new Date();
  const thresholds = deps.thresholds ?? ALERT_THRESHOLDS;
  // Copied out of the readonly store result because this run updates it in
  // place: once a threshold fires, its remaining labels are within cooldown
  // for the rest of the run.
  const lastFiredAtByKey: Record<string, string> = { ...(await deps.store.lastFiredAtByKey()) };

  const firedKeys: string[] = [];

  for (const threshold of thresholds) {
    const since = new Date(now.getTime() - threshold.windowSeconds * 1000);

    let populations: readonly AlertPopulation[];
    try {
      populations = await populationsFor(threshold, since, deps);
    } catch (error) {
      // One unreadable source must not abort the whole run — the other
      // thresholds may still have something worth saying.
      deps.logger.warn('alerting.evaluation.source_failed', {
        alertKey: threshold.key,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });
      continue;
    }

    const evaluations = evaluateThreshold(threshold, populations, {
      lastFiredAt: lastFiredAtByKey[threshold.key],
      now,
    });

    // One notification per threshold per run, describing the *worst* breach.
    //
    // The cooldown cannot do this on its own: `evaluateThreshold` judges
    // every population against the cooldown as it stood at the start of the
    // run, so three routes breaching at once all pass it and all notify.
    // That was a real bug, caught by the "one incident, one notification"
    // test. Collapsing here is also better than firing on whichever label
    // happened to sort first — an operator should be told about the 90%
    // route, not the 6% one.
    const breaches = firingsOf(evaluations);
    const worst = breaches.reduce<AlertEvaluation | undefined>(
      (candidate, evaluation) =>
        candidate === undefined || evaluation.observedRate > candidate.observedRate
          ? evaluation
          : candidate,
      undefined,
    );

    if (worst !== undefined) {
      const evaluation = worst;
      const firedAt = now.toISOString();

      await deps.store.recordFiring({
        alertKey: threshold.key,
        windowSeconds: threshold.windowSeconds,
        numerator: evaluation.population.numerator,
        denominator: evaluation.population.denominator,
        observedRate: evaluation.observedRate,
        thresholdRate: threshold.rate,
        firedAt,
      });

      const event = buildOutboxEvent({
        eventType: 'ops.alert.fired',
        entityType: 'OPERATIONAL_ALERT',
        // A fresh uuid, because `outbox_events.entity_id` and
        // `staff_notifications.entity_id` are both `uuid` columns — the
        // alert's own identity travels in `payload.alertKey` instead, which
        // is what the staff view reads anyway.
        entityId: deps.generateId(),
        destination: 'staff_notification',
        payload: notificationPayload(evaluation),
        generateId: deps.generateId,
        now: () => now,
      });
      await deps.outbox.append(event);

      deps.logger.warn('alerting.threshold.fired', notificationPayload(evaluation));

      firedKeys.push(threshold.key);

      // Also recorded so a subsequent run in the same cooldown window sees
      // it even if the store read is stale.
      lastFiredAtByKey[threshold.key] = firedAt;

      if (breaches.length > 1) {
        // Said once, so the count is not silently lost: the other breaching
        // labels are real, they are just part of the same incident.
        deps.logger.warn('alerting.threshold.additional_breaches', {
          alertKey: threshold.key,
          breachingPopulations: breaches.length,
        });
      }
    }
  }

  return {
    evaluatedAt: now.toISOString(),
    thresholdsEvaluated: thresholds.length,
    firedCount: firedKeys.length,
    firedKeys,
  };
}
