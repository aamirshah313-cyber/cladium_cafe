import { describe, expect, it, vi } from 'vitest';
import {
  MIN_MEANINGFUL_SAMPLE_COUNT,
  VITALS_SAMPLE_RETENTION_DAYS,
  isMeaningfulSampleCount,
  resolveRoutePattern,
  resolveViewportBucket,
} from '../../src/modules/telemetry/vitals-sample';
import {
  continuousPercentile,
  createInMemoryWebVitalsSampleStore,
} from '../../src/modules/telemetry/vitals-store';
import { recordVitalsSample } from '../../src/modules/telemetry/record-vitals-sample';
import { runVitalsRetentionJob } from '../../src/modules/telemetry/retention';
import { reportVitalsBodySchema } from '../../src/modules/telemetry/schemas';
import { createLogger, type LogEntry } from '../../src/lib/logging';

const NOW = new Date('2026-09-19T12:00:00Z');

function collectingLogger() {
  const entries: LogEntry[] = [];
  return {
    entries,
    logger: createLogger({ sink: { write: (entry) => entries.push(entry) } }),
  };
}

function report(overrides: Partial<Parameters<typeof recordVitalsSample>[1]> = {}) {
  return {
    metric: 'LCP' as const,
    value: 2100,
    rating: 'good' as const,
    navigationType: 'navigate' as const,
    pathname: '/en/menu',
    viewportWidth: 390,
    ...overrides,
  };
}

describe('resolveRoutePattern', () => {
  it('maps each known localized route onto its token, in both locales', () => {
    expect(resolveRoutePattern('/en')).toEqual({ locale: 'en', routePattern: 'home' });
    expect(resolveRoutePattern('/ur/')).toEqual({ locale: 'ur', routePattern: 'home' });
    expect(resolveRoutePattern('/en/menu')).toEqual({ locale: 'en', routePattern: 'menu' });
    expect(resolveRoutePattern('/ur/book')).toEqual({ locale: 'ur', routePattern: 'book' });
    expect(resolveRoutePattern('/en/event')).toEqual({ locale: 'en', routePattern: 'event' });
    expect(resolveRoutePattern('/en/visit')).toEqual({ locale: 'en', routePattern: 'visit' });
    expect(resolveRoutePattern('/ur/concierge')).toEqual({
      locale: 'ur',
      routePattern: 'concierge',
    });
  });

  it('never echoes an unrecognized path back — the whole point of the allowlist', () => {
    // A hostile client cannot use `pathname` as free-text storage: whatever it
    // sends, the stored value is one of the eight fixed tokens.
    for (const pathname of [
      '/en/some-unknown-page',
      '/en/menu/deep/nesting',
      '/fr/menu',
      '/',
      '/staff',
    ]) {
      const { routePattern } = resolveRoutePattern(pathname);
      expect(['home', 'menu', 'book', 'event', 'visit', 'concierge', 'privacy', 'other']).toContain(
        routePattern,
      );
    }

    expect(resolveRoutePattern('/en/some-unknown-page').routePattern).toBe('other');
    expect(resolveRoutePattern('/en/menu/deep/nesting').routePattern).toBe('menu');
  });

  it('falls back to en/other for a path with no supported locale segment, rather than guessing', () => {
    expect(resolveRoutePattern('/fr/menu')).toEqual({ locale: 'en', routePattern: 'other' });
    expect(resolveRoutePattern('/')).toEqual({ locale: 'en', routePattern: 'other' });
  });
});

describe('resolveViewportBucket', () => {
  it('buckets at the layout breakpoints', () => {
    expect(resolveViewportBucket(390)).toBe('mobile');
    expect(resolveViewportBucket(767)).toBe('mobile');
    expect(resolveViewportBucket(768)).toBe('tablet');
    expect(resolveViewportBucket(1023)).toBe('tablet');
    expect(resolveViewportBucket(1024)).toBe('desktop');
    expect(resolveViewportBucket(3840)).toBe('desktop');
  });

  it('is total — a nonsense width becomes a bucket, never an error', () => {
    expect(resolveViewportBucket(0)).toBe('mobile');
    expect(resolveViewportBucket(-1)).toBe('mobile');
    expect(resolveViewportBucket(Number.NaN)).toBe('mobile');
    expect(resolveViewportBucket(Number.POSITIVE_INFINITY)).toBe('mobile');
  });
});

describe('reportVitalsBodySchema', () => {
  it('accepts a well-formed report', () => {
    expect(reportVitalsBodySchema.safeParse(report()).success).toBe(true);
  });

  it('rejects unknown keys, so an extra field cannot ride along to the table', () => {
    const result = reportVitalsBodySchema.safeParse({ ...report(), sessionId: 'session-1' });
    expect(result.success).toBe(false);
  });

  it('rejects a value the database check constraint would also reject', () => {
    expect(reportVitalsBodySchema.safeParse(report({ value: 600_001 })).success).toBe(false);
    expect(reportVitalsBodySchema.safeParse(report({ value: -1 })).success).toBe(false);
    expect(reportVitalsBodySchema.safeParse(report({ value: 600_000 })).success).toBe(true);
  });

  it('rejects a pathname carrying a query string, fragment, or absolute URL', () => {
    for (const pathname of [
      '/en/menu?utm_source=x',
      '/en/menu#section',
      'https://evil.example/en/menu',
      '/en/menu ',
    ]) {
      const result = reportVitalsBodySchema.safeParse(report({ pathname }));
      // The trailing-space case is trimmed and then valid; the rest must fail.
      if (pathname === '/en/menu ') expect(result.success).toBe(true);
      else expect(result.success).toBe(false);
    }
  });

  it('rejects an invented metric name or rating', () => {
    expect(reportVitalsBodySchema.safeParse(report({ metric: 'FCP2' as never })).success).toBe(
      false,
    );
    expect(reportVitalsBodySchema.safeParse(report({ rating: 'great' as never })).success).toBe(
      false,
    );
  });
});

describe('recordVitalsSample', () => {
  it('stores only normalized fields — no pathname, no raw viewport width', async () => {
    const store = createInMemoryWebVitalsSampleStore();
    const { logger } = collectingLogger();

    const outcome = await recordVitalsSample(
      { store, isFeatureEnabled: () => true, logger, now: () => NOW },
      report({ pathname: '/ur/book', viewportWidth: 1440 }),
    );

    expect(outcome).toEqual({ recorded: true });
    expect(store.samples).toHaveLength(1);
    expect(store.samples[0]).toEqual({
      metric: 'LCP',
      value: 2100,
      rating: 'good',
      navigationType: 'navigate',
      routePattern: 'book',
      locale: 'ur',
      viewportBucket: 'desktop',
      recordedAt: NOW.toISOString(),
    });

    const stored = store.samples[0] as unknown as Record<string, unknown>;
    expect(stored).not.toHaveProperty('pathname');
    expect(stored).not.toHaveProperty('viewportWidth');
    expect(stored).not.toHaveProperty('sessionId');
  });

  it('records nothing at all when the feature flag is off', async () => {
    const store = createInMemoryWebVitalsSampleStore();
    const { logger } = collectingLogger();

    const outcome = await recordVitalsSample(
      { store, isFeatureEnabled: () => false, logger, now: () => NOW },
      report(),
    );

    expect(outcome).toEqual({ recorded: false });
    expect(store.samples).toHaveLength(0);
  });

  it('swallows a storage failure into recorded:false and warns, never throwing at the guest', async () => {
    const { entries, logger } = collectingLogger();
    const store = createInMemoryWebVitalsSampleStore();
    const failing = {
      ...store,
      record: vi.fn().mockRejectedValue(new Error('insert failed')),
    };

    const outcome = await recordVitalsSample(
      { store: failing, isFeatureEnabled: () => true, logger, now: () => NOW },
      report(),
    );

    expect(outcome).toEqual({ recorded: false });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('warn');
    expect(entries[0]?.event).toBe('telemetry.vitals.record_failed');
    // The log carries the error's type, never its message or the report body.
    expect(entries[0]?.fields).toEqual({
      metric: 'LCP',
      routePattern: 'menu',
      errorType: 'Error',
    });
  });
});

describe('continuousPercentile', () => {
  it('matches percentile_cont for a population needing interpolation', () => {
    // n = 5, p = 0.75 → index 0.75 * 4 = 3 exactly → the 4th sorted value.
    expect(continuousPercentile([10, 20, 30, 40, 50], 0.75)).toBe(40);
    // n = 4 → index 0.75 * 3 = 2.25 → 30 + (40 - 30) * 0.25.
    expect(continuousPercentile([10, 20, 30, 40], 0.75)).toBeCloseTo(32.5, 10);
    // Order of input must not matter.
    expect(continuousPercentile([40, 10, 30, 20], 0.75)).toBeCloseTo(32.5, 10);
  });

  it('handles the degenerate populations', () => {
    expect(continuousPercentile([], 0.75)).toBeNull();
    expect(continuousPercentile([7], 0.75)).toBe(7);
  });
});

describe('in-memory percentile aggregation', () => {
  async function seed() {
    const store = createInMemoryWebVitalsSampleStore();
    const base = {
      rating: 'good' as const,
      navigationType: 'navigate' as const,
      locale: 'en' as const,
      recordedAt: NOW.toISOString(),
    };
    for (const value of [1000, 2000, 3000, 4000]) {
      await store.record({
        ...base,
        metric: 'LCP',
        value,
        routePattern: 'menu',
        viewportBucket: 'mobile',
      });
    }
    await store.record({
      ...base,
      metric: 'LCP',
      value: 9000,
      routePattern: 'home',
      viewportBucket: 'desktop',
    });
    await store.record({
      ...base,
      metric: 'CLS',
      value: 0.05,
      routePattern: 'menu',
      viewportBucket: 'mobile',
    });
    return store;
  }

  it('slices by metric, route, and viewport, and reports the count behind each percentile', async () => {
    const store = await seed();
    const rows = await store.percentilesByRoute({ since: '2026-01-01T00:00:00.000Z' });

    const menuLcp = rows.find(
      (row) =>
        row.metric === 'LCP' && row.routePattern === 'menu' && row.viewportBucket === 'mobile',
    );
    expect(menuLcp?.sampleCount).toBe(4);
    expect(menuLcp?.p75).toBeCloseTo(3250, 10);

    const homeLcp = rows.find((row) => row.metric === 'LCP' && row.routePattern === 'home');
    expect(homeLcp?.sampleCount).toBe(1);
    expect(homeLcp?.p75).toBe(9000);
  });

  it('computes the site-wide percentile from raw samples, not from per-route percentiles', async () => {
    const store = await seed();
    const [overallLcp] = (
      await store.percentilesOverall({ since: '2026-01-01T00:00:00.000Z' })
    ).filter((row) => row.metric === 'LCP');

    // All five LCP samples together: 1000,2000,3000,4000,9000 → index 3 → 4000.
    expect(overallLcp?.sampleCount).toBe(5);
    expect(overallLcp?.p75).toBe(4000);
    expect(overallLcp?.routePattern).toBeNull();
    expect(overallLcp?.viewportBucket).toBeNull();
  });

  it('excludes samples older than the requested window', async () => {
    const store = createInMemoryWebVitalsSampleStore();
    const common = {
      metric: 'INP' as const,
      rating: 'good' as const,
      navigationType: 'navigate' as const,
      routePattern: 'menu' as const,
      locale: 'en' as const,
      viewportBucket: 'mobile' as const,
    };
    await store.record({ ...common, value: 10, recordedAt: '2026-01-01T00:00:00.000Z' });
    await store.record({ ...common, value: 20, recordedAt: NOW.toISOString() });

    const rows = await store.percentilesByRoute({ since: '2026-09-01T00:00:00.000Z' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sampleCount).toBe(1);
    expect(rows[0]?.p75).toBe(20);
  });
});

describe('runVitalsRetentionJob', () => {
  it('prunes only samples older than the retention window', async () => {
    const store = createInMemoryWebVitalsSampleStore();
    const common = {
      metric: 'LCP' as const,
      value: 1000,
      rating: 'good' as const,
      navigationType: 'navigate' as const,
      routePattern: 'menu' as const,
      locale: 'en' as const,
      viewportBucket: 'mobile' as const,
    };
    const daysAgo = (days: number) =>
      new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    await store.record({ ...common, recordedAt: daysAgo(VITALS_SAMPLE_RETENTION_DAYS + 5) });
    await store.record({ ...common, recordedAt: daysAgo(VITALS_SAMPLE_RETENTION_DAYS - 5) });
    await store.record({ ...common, recordedAt: daysAgo(1) });

    const summary = await runVitalsRetentionJob({ store, now: () => NOW });

    expect(summary.prunedCount).toBe(1);
    expect(summary.retentionDays).toBe(VITALS_SAMPLE_RETENTION_DAYS);
    expect(summary.ranAt).toBe(NOW.toISOString());
    expect(store.samples).toHaveLength(2);
  });

  it('is idempotent — a second run in the same instant prunes nothing new', async () => {
    const store = createInMemoryWebVitalsSampleStore();
    await store.record({
      metric: 'CLS',
      value: 0.2,
      rating: 'needs-improvement',
      navigationType: 'navigate',
      routePattern: 'home',
      locale: 'en',
      viewportBucket: 'mobile',
      recordedAt: new Date(
        NOW.getTime() - (VITALS_SAMPLE_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    expect((await runVitalsRetentionJob({ store, now: () => NOW })).prunedCount).toBe(1);
    expect((await runVitalsRetentionJob({ store, now: () => NOW })).prunedCount).toBe(0);
  });
});

describe('isMeaningfulSampleCount', () => {
  it('refuses to call a handful of page loads a field measurement', () => {
    expect(isMeaningfulSampleCount(MIN_MEANINGFUL_SAMPLE_COUNT - 1)).toBe(false);
    expect(isMeaningfulSampleCount(MIN_MEANINGFUL_SAMPLE_COUNT)).toBe(true);
  });
});
