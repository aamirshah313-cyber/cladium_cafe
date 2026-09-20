/**
 * The vocabulary of operational signals, and the allowlist of labels that
 * may be recorded — engineering item 8 of Step 45's punch list
 * (`production-readiness-decision.md`, D-049).
 *
 * Step 41 proposed four alert thresholds and said plainly that no
 * monitoring stack existed to evaluate them. Three of the four had no
 * signal at all: rate-limit rejections were never recorded (and
 * `rate_limit_windows` keys by a SHA-256 hash, so even the current window
 * cannot be attributed to a route), and provider timeouts and concierge
 * deadline hits were logged and then forgotten. This module is where those
 * three become something a threshold can actually read.
 *
 * ## Why labels are an allowlist
 *
 * `OPERATIONAL_LABELS` is a closed set, and `isOperationalLabel` is the only
 * way into the store. That is deliberate for two reasons, the second less
 * obvious than the first:
 *
 *   1. Cardinality. `operational_counters` is keyed by (minute, kind, label,
 *      outcome); an unbounded label turns a bounded table into one row per
 *      distinct string per minute.
 *   2. A label is a *rate denominator's identity*. If one call site writes
 *      `req-submit` and another writes `request-submit`, they silently
 *      become two populations and each one's rate is computed against half
 *      the traffic — an alert that fires on arithmetic rather than on
 *      reality. A closed set makes that a compile error instead.
 *
 * Isomorphic and secret-free, but in practice only server code records.
 */

/** What is being counted. Mirrors the `operational_counters.kind` check constraint. */
export const OPERATIONAL_KINDS = ['rate_limit', 'provider_call', 'concierge_turn'] as const;
export type OperationalKind = (typeof OPERATIONAL_KINDS)[number];

/**
 * `ok` is the denominator; the others are numerators. Recording `ok` is what
 * makes every threshold a rate rather than a raw count — a raw count of
 * rejections cannot distinguish "abuse" from "twice as many guests".
 */
export const OPERATIONAL_OUTCOMES = ['ok', 'rejected', 'timeout'] as const;
export type OperationalOutcome = (typeof OPERATIONAL_OUTCOMES)[number];

/**
 * Every label that may be recorded, grouped by the kind it belongs to.
 *
 * The `rate_limit` labels are exactly the `keyPrefix` values the guest
 * routes already pass to `guestRouteRateLimiter.consume` — reusing that
 * existing vocabulary rather than inventing a parallel one, so a route's
 * limit bucket and its alert population are named the same thing.
 */
export const OPERATIONAL_LABELS: Readonly<Record<OperationalKind, readonly string[]>> = {
  rate_limit: [
    'cart-item',
    'req-review',
    'req-submit',
    'consent',
    'meta-track',
    'telemetry-vitals',
    'vapi-token',
    'concierge-chat',
  ],
  provider_call: ['vapi_tool', 'meta_event'],
  concierge_turn: ['chat'],
};

export type OperationalLabel = string;

/** The only way a label enters the store — see the module comment on why this is closed. */
export function isOperationalLabel(kind: OperationalKind, label: string): boolean {
  return OPERATIONAL_LABELS[kind].includes(label);
}

/** One occurrence to be counted. Carries no identity of any kind by design. */
export interface OperationalOccurrence {
  readonly kind: OperationalKind;
  readonly label: OperationalLabel;
  readonly outcome: OperationalOutcome;
}

/** Numerator and denominator for one (kind, label) population over a window. */
export interface OperationalTotals {
  readonly kind: OperationalKind;
  readonly label: OperationalLabel;
  /** Occurrences with outcome `ok`. */
  readonly okCount: number;
  /** Occurrences with any other outcome — `rejected` or `timeout`. */
  readonly badCount: number;
}

/**
 * How long counters are kept. Far longer than the longest threshold window
 * (1 hour) so a firing's evidence can still be re-derived afterwards, and
 * short enough that a minute-bucketed table on a free-tier database stays
 * small. An operational storage choice, not a compliance one — the rows are
 * anonymous.
 */
export const OPERATIONAL_COUNTER_RETENTION_DAYS = 14;
