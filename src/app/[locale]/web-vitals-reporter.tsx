'use client';

/**
 * Browser-side Core Web Vitals reporter — the collecting half of item 6 of
 * Step 45's punch list (`production-readiness-decision.md`, D-049).
 *
 * `useReportWebVitals` is built into Next (`next/web-vitals`), so this adds
 * no dependency: no `web-vitals` package, no `@vercel/speed-insights` (which
 * is also a paid Vercel feature this project's plan does not include, and
 * would tie measurement to one host against `CLAUDE.md`'s portability rule).
 *
 * Rendered only when the server layout has already decided
 * `FEATURE_FIELD_TELEMETRY` is on, so a disabled deployment ships no
 * reporter at all rather than a reporter that beacons into a 404.
 *
 * ## `sendBeacon`, and why the callback identity is stable
 *
 * The handler is defined at module scope, not inside the component. Next's
 * own documentation is explicit that a changing callback reference causes
 * duplicate reports ("New functions passed to `useReportWebVitals` are called
 * with the available metrics up to that point"), and an inline arrow would be
 * a new function on every render — every re-render would re-report every
 * metric seen so far and quietly multiply the population a percentile is
 * computed over.
 *
 * `navigator.sendBeacon` is preferred because vitals finalize as a page is
 * being unloaded, which is exactly when an ordinary `fetch` is most likely to
 * be cancelled. The `fetch(..., { keepalive: true })` fallback covers
 * browsers without it. Both paths swallow every failure: telemetry must never
 * surface an error to a guest or affect the page it is measuring.
 *
 * The `Blob` type is set to `application/json` deliberately — the route
 * enforces its content type, and a beacon's media type comes from the blob.
 */

import { useReportWebVitals } from 'next/web-vitals';
import {
  MAX_REPORTED_VIEWPORT_WIDTH,
  VITALS_BEACON_PATH,
  VITALS_METRICS,
  VITALS_NAVIGATION_TYPES,
  VITALS_RATINGS,
  type VitalsMetric,
  type VitalsNavigationType,
  type VitalsRating,
} from '../../modules/telemetry/vitals-sample';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];
type ReportedMetric = Parameters<ReportWebVitalsCallback>[0];

/**
 * Next reports its own custom metrics (`Next.js-hydration` and friends)
 * through the same callback as the standard ones, so a metric name must be
 * checked against the closed set rather than assumed — the server would
 * reject an unknown one anyway, and sending a request destined for a 400
 * wastes the guest's connection.
 */
function isCollectedMetric(name: string): name is VitalsMetric {
  return (VITALS_METRICS as readonly string[]).includes(name);
}

function isKnownRating(value: string | undefined): value is VitalsRating {
  return value !== undefined && (VITALS_RATINGS as readonly string[]).includes(value);
}

function isKnownNavigationType(value: string | undefined): value is VitalsNavigationType {
  return value !== undefined && (VITALS_NAVIGATION_TYPES as readonly string[]).includes(value);
}

function post(body: string): void {
  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(VITALS_BEACON_PATH, blob)
    )
      return;
    void fetch(VITALS_BEACON_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Best-effort — never surfaced to the guest.
  }
}

const reportVitals: ReportWebVitalsCallback = (metric: ReportedMetric) => {
  if (!isCollectedMetric(metric.name)) return;
  if (!isKnownRating(metric.rating) || !isKnownNavigationType(metric.navigationType)) return;

  post(
    JSON.stringify({
      metric: metric.name,
      // Rounded to whole milliseconds for every metric except CLS, whose
      // useful range is roughly 0–1: rounding that would turn every real
      // score into 0 and make the percentile meaningless.
      value: metric.name === 'CLS' ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
      rating: metric.rating,
      navigationType: metric.navigationType,
      // Pathname only — no query string or fragment, which the route's schema
      // also refuses. The server reduces this to one of eight route tokens.
      pathname: window.location.pathname,
      viewportWidth: Math.min(
        Math.max(Math.round(window.innerWidth), 0),
        MAX_REPORTED_VIEWPORT_WIDTH,
      ),
    }),
  );
};

export function WebVitalsReporter() {
  useReportWebVitals(reportVitals);
  return null;
}
