/**
 * Threshold evaluation — pure, deterministic, and deliberately unaware of
 * where its numbers came from or where a firing goes.
 *
 * This is the part that decides whether an alert is real, so it is the part
 * that has to be testable without a database, a clock, or a notification
 * channel. `run-alert-evaluation.ts` does the gathering and the delivery;
 * everything judgemental lives here.
 *
 * The rule is the same for every threshold: a population with a numerator, a
 * denominator, a floor under the denominator, and a rate. Nothing fires on
 * a raw count, and nothing fires on a population too small to mean anything
 * — see `thresholds.ts` on why that floor is load-bearing rather than
 * decorative.
 */

import { ALERT_COOLDOWN_SECONDS, type AlertThreshold, type AlertSource } from './thresholds';
import type { OperationalTotals } from './operational-event';

/** One population to judge: a whole threshold, or one label within it. */
export interface AlertPopulation {
  /** Present when the threshold is evaluated per label (e.g. one guest route). */
  readonly label: string | null;
  /** Occurrences that count against the threshold. */
  readonly numerator: number;
  /** Total occurrences observed, numerator included. */
  readonly denominator: number;
}

export interface AlertEvaluation {
  readonly threshold: AlertThreshold;
  readonly population: AlertPopulation;
  readonly observedRate: number;
  /** Why it did not fire, when it did not. `null` means it fired. */
  readonly suppressedBy: 'below_threshold' | 'insufficient_data' | 'cooldown' | null;
}

export interface AlertFiringRecord {
  readonly alertKey: string;
  readonly firedAt: string;
}

/**
 * `denominator` of 0 yields a rate of 0, not NaN or a division error — an
 * empty window is "nothing happened", which is never an alert.
 */
export function observedRate(population: AlertPopulation): number {
  if (population.denominator <= 0) return 0;
  return population.numerator / population.denominator;
}

/**
 * Cooldown is checked against the most recent firing of the *same key*,
 * across labels rather than per label. A rate-limit problem affecting three
 * routes at once is one incident, and three notifications for it is three
 * times the noise for the same information.
 */
export function isWithinCooldown(
  lastFiredAt: string | undefined,
  now: Date,
  cooldownSeconds: number = ALERT_COOLDOWN_SECONDS,
): boolean {
  if (lastFiredAt === undefined) return false;
  const elapsedMs = now.getTime() - new Date(lastFiredAt).getTime();
  // A firing timestamped in the future (clock skew between instances) is
  // treated as recent rather than expired: staying quiet is the safer
  // failure here, since the alternative is a notification storm.
  return elapsedMs < cooldownSeconds * 1000;
}

export function evaluatePopulation(
  threshold: AlertThreshold,
  population: AlertPopulation,
  options: { readonly lastFiredAt?: string; readonly now: Date },
): AlertEvaluation {
  const rate = observedRate(population);

  const suppressedBy: AlertEvaluation['suppressedBy'] =
    population.denominator < threshold.minimumDenominator
      ? 'insufficient_data'
      : rate <= threshold.rate
        ? 'below_threshold'
        : isWithinCooldown(options.lastFiredAt, options.now)
          ? 'cooldown'
          : null;

  return { threshold, population, observedRate: rate, suppressedBy };
}

/**
 * Turns per-(kind,label) totals into the populations one counter-backed
 * threshold should judge — one per label, because the report's wording is
 * "any single guest-mutation route", not "all routes averaged together".
 * Averaging would let a healthy high-traffic route mask a broken quiet one.
 *
 * Totals whose label is not in this threshold's kind are ignored rather than
 * rejected: the store is shared across kinds.
 */
export function populationsFromTotals(
  source: AlertSource,
  totals: readonly OperationalTotals[],
): readonly AlertPopulation[] {
  if (source.type !== 'counter') return [];
  return totals
    .filter((total) => total.kind === source.kind)
    .map((total) => ({
      label: total.label,
      numerator: total.badCount,
      denominator: total.okCount + total.badCount,
    }));
}

/** Evaluates every population of one threshold, newest-firing cooldown applied to all of them. */
export function evaluateThreshold(
  threshold: AlertThreshold,
  populations: readonly AlertPopulation[],
  options: { readonly lastFiredAt?: string; readonly now: Date },
): readonly AlertEvaluation[] {
  return populations.map((population) => evaluatePopulation(threshold, population, options));
}

/** The evaluations that should actually notify. */
export function firingsOf(evaluations: readonly AlertEvaluation[]): readonly AlertEvaluation[] {
  return evaluations.filter((evaluation) => evaluation.suppressedBy === null);
}
