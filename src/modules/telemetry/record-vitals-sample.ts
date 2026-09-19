/**
 * The one decision point where a browser's Web Vitals report becomes a
 * stored sample. Every caller goes through here — there is no second path
 * that writes to `web_vitals_samples` — the same single-decision-point
 * shape `trackMetaEvent` uses for Meta events.
 *
 * Two guarantees live here rather than in the route:
 *
 *   1. **Flag-gated.** `FEATURE_FIELD_TELEMETRY` defaults off (and is
 *      off in every environment until the owner turns it on), so shipping
 *      this code does not start collecting anything. The route *also*
 *      checks the flag, to fail closed with a 404 before it spends effort
 *      parsing a body; this check is the one that makes the guarantee
 *      structural rather than route-dependent.
 *   2. **Normalized before storage.** The raw `pathname` and
 *      `viewportWidth` a client sent never reach the store — only the
 *      bounded tokens `resolveRoutePattern`/`resolveViewportBucket` return.
 *      See `vitals-sample.ts` on why that is a privacy control.
 *
 * A storage failure is swallowed into `{ recorded: false }` rather than
 * raised. Nothing a guest sees depends on this succeeding, and a telemetry
 * outage must not turn into a visible error or a retry storm from every
 * open page; the `warn` is the signal an operator would act on, which is
 * exactly what the still-open alerting item (item 8 of Step 45's punch
 * list) would eventually watch.
 */

import type { Logger } from '../../lib/logging';
import { resolveRoutePattern, resolveViewportBucket, type VitalsReport } from './vitals-sample';
import type { WebVitalsSampleStore } from './vitals-store';

export interface RecordVitalsSampleDeps {
  readonly store: WebVitalsSampleStore;
  readonly isFeatureEnabled: () => boolean;
  readonly logger: Logger;
  readonly now?: () => Date;
}

export interface RecordVitalsSampleOutcome {
  readonly recorded: boolean;
}

export async function recordVitalsSample(
  deps: RecordVitalsSampleDeps,
  report: VitalsReport,
): Promise<RecordVitalsSampleOutcome> {
  if (!deps.isFeatureEnabled()) return { recorded: false };

  const { locale, routePattern } = resolveRoutePattern(report.pathname);
  const recordedAt = (deps.now?.() ?? new Date()).toISOString();

  try {
    await deps.store.record({
      metric: report.metric,
      value: report.value,
      rating: report.rating,
      navigationType: report.navigationType,
      routePattern,
      locale,
      viewportBucket: resolveViewportBucket(report.viewportWidth),
      recordedAt,
    });
  } catch (error) {
    deps.logger.warn('telemetry.vitals.record_failed', {
      metric: report.metric,
      routePattern,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return { recorded: false };
  }

  return { recorded: true };
}
