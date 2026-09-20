/**
 * The four alert thresholds from `performance-resilience-report.md`,
 * transcribed as data rather than restated as prose — engineering item 8 of
 * Step 45's punch list (D-049).
 *
 * Step 41 wrote these as "engineering-judgment proposals tied to mechanisms
 * already built this session, not an owner-approved SLA". That status has
 * not changed: nothing here has been through owner review, and
 * `docs/alerting.md` says so where an operator will read it. They are
 * encoded faithfully — same rates, same windows — so that the moment the
 * owner does approve (or revise) an SLA, the change is these numbers and
 * nothing else.
 *
 * ## The fifth proposal is deliberately absent
 *
 * The report also listed staff-transition version conflicts, and explicitly
 * said **"track for visibility only, do not alert — a normal, expected
 * outcome of legitimate concurrent staff activity, not a failure signal."**
 * So there is no threshold for it and nothing counts it. An alert that fires
 * on healthy behavior trains people to ignore alerts, which costs more than
 * the signal is worth.
 *
 * ## `minimumDenominator` is not in the report, and is load-bearing
 *
 * A rate over a tiny population is noise: one rejected request out of two is
 * a 50% rejection rate, and at 3am on a café's website two requests is a
 * normal five minutes. Every threshold therefore also requires a floor on
 * the denominator before it can fire at all. Without it the first alert this
 * system ever sent would almost certainly have been spurious, and the
 * second would have been ignored.
 *
 * The floors are scaled to each window and to what that window plausibly
 * sees, not copied between rules.
 */

import type { OperationalKind } from './operational-event';

/** Where a threshold's numbers come from. See `evaluate.ts` for how each is gathered. */
export type AlertSource =
  /** Derived directly from `outbox_events` — the source of truth already exists. */
  | { readonly type: 'outbox' }
  /** Summed from `operational_counters` for this kind, evaluated per label. */
  | { readonly type: 'counter'; readonly kind: OperationalKind };

export interface AlertThreshold {
  /** Stable key; matches `alert_firings.alert_key` and must satisfy its format check. */
  readonly key: string;
  /** One line an operator reads in the notification. States the condition, not the fix. */
  readonly summary: string;
  readonly source: AlertSource;
  /** Rolling window, in seconds — verbatim from the report. */
  readonly windowSeconds: number;
  /** Fires when the observed rate is strictly greater than this. */
  readonly rate: number;
  /** Minimum denominator before the rate is considered meaningful at all. */
  readonly minimumDenominator: number;
}

/**
 * How long a fired threshold stays quiet before it may fire again. The
 * condition usually persists across several evaluation runs — a systemic
 * handler bug does not resolve in five minutes — and re-notifying every run
 * would bury the staff queue under copies of one incident.
 *
 * 30 minutes is long enough to avoid that and short enough that a genuinely
 * ongoing problem re-announces itself rather than being forgotten after one
 * dismissed notification.
 */
export const ALERT_COOLDOWN_SECONDS = 30 * 60;

export const ALERT_THRESHOLDS: readonly AlertThreshold[] = [
  {
    key: 'outbox_terminal_failure_rate',
    summary:
      'Outbox events are failing permanently rather than succeeding on retry — likely a handler bug or an unreachable downstream.',
    source: { type: 'outbox' },
    // "> 1% of dispatched events reaching FAILED in a rolling 1-hour window".
    windowSeconds: 60 * 60,
    rate: 0.01,
    // An hour is the longest window here, so the floor can be meaningful
    // without being unreachable: below 20 dispatched events an hour, one
    // failure is not evidence of a systemic problem.
    minimumDenominator: 20,
  },
  {
    key: 'rate_limit_rejection_rate',
    summary:
      'A guest route is rejecting an unusual share of requests with 429 — either real abuse, or a limit calibrated too tight for genuine traffic.',
    source: { type: 'counter', kind: 'rate_limit' },
    // "> 5% of requests to any single guest-mutation route ... in a rolling
    // 5-minute window". Evaluated per label, which is what "any single
    // route" means.
    windowSeconds: 5 * 60,
    rate: 0.05,
    // Five minutes is short, so the floor is correspondingly low — but 20
    // still rules out the 1-in-2 case that would otherwise dominate.
    minimumDenominator: 20,
  },
  {
    key: 'provider_timeout_rate',
    summary:
      'An upstream provider is timing out on a large share of calls — likely provider-side degradation rather than a bug here.',
    source: { type: 'counter', kind: 'provider_call' },
    // "> 10% of Vapi tool-call or Meta-tracking calls hitting their own
    // bounded timeout in a rolling 15-minute window".
    windowSeconds: 15 * 60,
    rate: 0.1,
    // Provider calls are far rarer than guest requests (both features are
    // currently flag-gated off entirely), so this floor is deliberately the
    // lowest — high enough to exclude a single timeout, low enough to fire
    // during genuinely low-volume operation.
    minimumDenominator: 10,
  },
  {
    key: 'concierge_deadline_hit_rate',
    summary:
      'Concierge chat turns are hitting the 20s deadline — likely Anthropic API degradation or a misbehaving tool loop.',
    source: { type: 'counter', kind: 'concierge_turn' },
    // "> 5% of chat turns hitting TURN_TIMEOUT_MS's 20s ceiling". The report
    // gave no window for this one, so it takes the same 15 minutes as the
    // other provider-degradation signal it most resembles — recorded here
    // rather than silently chosen.
    windowSeconds: 15 * 60,
    rate: 0.05,
    minimumDenominator: 10,
  },
];

export function findThreshold(key: string): AlertThreshold | undefined {
  return ALERT_THRESHOLDS.find((threshold) => threshold.key === key);
}
