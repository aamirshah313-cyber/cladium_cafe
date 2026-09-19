/**
 * Core Web Vitals field-sample types and the pure normalization that keeps
 * the stored population anonymous — closes engineering item 6 of Step 45's
 * punch list (`production-readiness-decision.md`, D-049).
 *
 * Step 41 measured Core Web Vitals locally and said so honestly: those were
 * a proxy, not field data. Gate 7 asks for real P75 numbers from real
 * devices, which needs a sample from a guest's browser. This module is the
 * boundary where a browser's report becomes something safe to store.
 *
 * ## Normalization is a privacy control, not tidying
 *
 * Everything here narrows an open-ended client value into a closed set:
 *
 *   * `resolveRoutePattern` maps a pathname onto eight fixed tokens. The
 *     raw pathname is never stored, so this table cannot accumulate a
 *     record of which specific URLs a visitor hit, and a hostile client
 *     cannot use the field as free-text storage — the output is always one
 *     of `ROUTE_PATTERNS`, whatever the input.
 *   * `resolveViewportBucket` collapses a reported width into three
 *     buckets. Width is a (small) fingerprinting signal and the exact
 *     number answers no question an operator has; "is mobile slower than
 *     desktop" needs a bucket.
 *
 * Both are deliberately total functions with no error path: a report that
 * cannot be understood becomes `other`/`mobile` rather than a rejected
 * request. Telemetry must never be the reason a guest sees a failure, and a
 * single unattributable sample is worth more than a dropped one.
 *
 * Isomorphic and secret-free — the browser reporter imports
 * `VITALS_BEACON_PATH` and `MAX_REPORTED_VIEWPORT_WIDTH` from here, so this
 * module must not gain a server-only import.
 */

/** The metrics `next/web-vitals` reports. Mirrors the `web_vitals_samples.metric` check constraint. */
export const VITALS_METRICS = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP'] as const;
export type VitalsMetric = (typeof VITALS_METRICS)[number];

/** The three Core Web Vitals Gate 7 names explicitly. TTFB/FCP are collected as supporting diagnostics. */
export const CORE_WEB_VITALS: readonly VitalsMetric[] = ['LCP', 'INP', 'CLS'];

export const VITALS_RATINGS = ['good', 'needs-improvement', 'poor'] as const;
export type VitalsRating = (typeof VITALS_RATINGS)[number];

/**
 * `PerformanceNavigationTiming.type` as `useReportWebVitals` normalizes it
 * (see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * use-report-web-vitals.md` — Next already converts `back_forward` to
 * `back-forward`, so this list is the normalized spelling, not the raw one).
 */
export const VITALS_NAVIGATION_TYPES = [
  'navigate',
  'reload',
  'prerender',
  'back-forward',
  'back-forward-cache',
  'restore',
] as const;
export type VitalsNavigationType = (typeof VITALS_NAVIGATION_TYPES)[number];

/** Closed set of route tokens. Mirrors the `web_vitals_samples.route_pattern` check constraint. */
export const ROUTE_PATTERNS = [
  'home',
  'menu',
  'book',
  'event',
  'visit',
  'concierge',
  'privacy',
  'other',
] as const;
export type RoutePattern = (typeof ROUTE_PATTERNS)[number];

export const VIEWPORT_BUCKETS = ['mobile', 'tablet', 'desktop'] as const;
export type ViewportBucket = (typeof VIEWPORT_BUCKETS)[number];

/**
 * Upper bound on a reported viewport width. Anything larger is clamped
 * rather than rejected — an implausible width is a broken or hostile
 * client, and the bucket it lands in (`desktop`) is the same either way.
 */
export const MAX_REPORTED_VIEWPORT_WIDTH = 10_000;

/** The endpoint the browser reporter beacons to. Shared so the client and route cannot drift apart. */
export const VITALS_BEACON_PATH = '/api/telemetry/vitals';

/**
 * How long a sample is kept. Long enough that a P75 spans real seasonal
 * variation in a café's traffic, short enough that the table stays small on
 * the current (free) Supabase plan. Unlike `CONSENT_EVENT_RETENTION_DAYS`
 * this needs no owner/legal review to shorten *or* lengthen: the rows are
 * anonymous and carry no consent proof, so retention here is an operational
 * choice about storage, not a compliance commitment.
 */
export const VITALS_SAMPLE_RETENTION_DAYS = 90;

/**
 * Minimum samples before a percentile is worth reading. Below this a "P75"
 * is describing a handful of page loads, not a field population —
 * `docs/field-telemetry.md` explains why reporting one anyway would repeat
 * exactly the mistake Step 41 was careful to avoid.
 */
export const MIN_MEANINGFUL_SAMPLE_COUNT = 100;

/** What the browser sends. `pathname`/`viewportWidth` are normalized away server-side and never stored. */
export interface VitalsReport {
  readonly metric: VitalsMetric;
  readonly value: number;
  readonly rating: VitalsRating;
  readonly navigationType: VitalsNavigationType;
  readonly pathname: string;
  readonly viewportWidth: number;
}

/** What is actually stored — every field a closed set or a bounded number. */
export interface VitalsSample {
  readonly metric: VitalsMetric;
  readonly value: number;
  readonly rating: VitalsRating;
  readonly navigationType: VitalsNavigationType;
  readonly routePattern: RoutePattern;
  readonly locale: 'en' | 'ur';
  readonly viewportBucket: ViewportBucket;
  readonly recordedAt: string;
}

/** One row of `web_vitals_p75` / `web_vitals_p75_overall`. `p75` is null only when no samples matched. */
export interface VitalsPercentile {
  readonly metric: VitalsMetric;
  readonly routePattern: RoutePattern | null;
  readonly viewportBucket: ViewportBucket | null;
  readonly sampleCount: number;
  readonly p75: number | null;
}

/**
 * First path segment after the locale → token. The mapping is explicit
 * rather than derived from the route tree on purpose: a new page must be
 * added here deliberately, so adding a route can never silently start
 * widening what this table records.
 */
const PATTERN_BY_FIRST_SEGMENT: Readonly<Record<string, RoutePattern>> = {
  menu: 'menu',
  book: 'book',
  event: 'event',
  visit: 'visit',
  concierge: 'concierge',
  privacy: 'privacy',
};

/**
 * Splits a pathname into its locale and route token. Query strings and
 * fragments are not handled here because they are never accepted: the
 * schema constrains `pathname` to path characters only, so a caller cannot
 * smuggle one in and rely on this function to strip it.
 *
 * A pathname whose first segment is not a supported locale (the
 * un-localized `/` fallback, or anything unexpected) resolves to `en` +
 * `other`: honest about not knowing rather than guessing a locale it has no
 * evidence for.
 */
export function resolveRoutePattern(pathname: string): {
  readonly locale: 'en' | 'ur';
  readonly routePattern: RoutePattern;
} {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const [first, second] = segments;

  if (first !== 'en' && first !== 'ur') return { locale: 'en', routePattern: 'other' };
  if (second === undefined) return { locale: first, routePattern: 'home' };

  return { locale: first, routePattern: PATTERN_BY_FIRST_SEGMENT[second] ?? 'other' };
}

/**
 * Bucket boundaries match `globals.css`'s own breakpoints so a slice here
 * means the same thing a layout decision does. Non-finite, negative, and
 * absurd widths all land in `mobile`/`desktop` rather than throwing — see
 * the module doc comment on why normalization has no error path.
 */
export function resolveViewportBucket(width: number): ViewportBucket {
  if (!Number.isFinite(width) || width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** True when a percentile rests on enough samples to be worth quoting. See `MIN_MEANINGFUL_SAMPLE_COUNT`. */
export function isMeaningfulSampleCount(sampleCount: number): boolean {
  return sampleCount >= MIN_MEANINGFUL_SAMPLE_COUNT;
}
