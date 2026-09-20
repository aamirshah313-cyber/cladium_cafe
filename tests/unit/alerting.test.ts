import { describe, expect, it, vi } from 'vitest';
import {
  ALERT_COOLDOWN_SECONDS,
  ALERT_THRESHOLDS,
  findThreshold,
} from '../../src/modules/alerting/thresholds';
import {
  evaluatePopulation,
  evaluateThreshold,
  firingsOf,
  isWithinCooldown,
  observedRate,
  populationsFromTotals,
} from '../../src/modules/alerting/evaluate';
import { createInMemoryAlertStore, type AlertStore } from '../../src/modules/alerting/alert-store';
import {
  isOperationalLabel,
  OPERATIONAL_LABELS,
} from '../../src/modules/alerting/operational-event';
import { recordOperationalOccurrence } from '../../src/modules/alerting/record-operational-occurrence';
import { runAlertEvaluation } from '../../src/modules/alerting/run-alert-evaluation';
import { createInMemoryOutboxStore } from '../../src/lib/domain/outbox-store';
import { createLogger, type LogEntry } from '../../src/lib/logging';

const NOW = new Date('2026-09-19T12:00:00Z');

function collectingLogger() {
  const entries: LogEntry[] = [];
  return { entries, logger: createLogger({ sink: { write: (e) => entries.push(e) } }) };
}

const outboxThreshold = findThreshold('outbox_terminal_failure_rate')!;
const rateLimitThreshold = findThreshold('rate_limit_rejection_rate')!;

describe('ALERT_THRESHOLDS', () => {
  it('transcribes Step 41’s four proposals, with their windows and rates', () => {
    expect(ALERT_THRESHOLDS.map((t) => [t.key, t.rate, t.windowSeconds])).toEqual([
      ['outbox_terminal_failure_rate', 0.01, 3600],
      ['rate_limit_rejection_rate', 0.05, 300],
      ['provider_timeout_rate', 0.1, 900],
      ['concierge_deadline_hit_rate', 0.05, 900],
    ]);
  });

  it('has no threshold for staff-transition conflicts, which the report said not to alert on', () => {
    const keys = ALERT_THRESHOLDS.map((t) => t.key).join(' ');
    expect(keys).not.toMatch(/conflict|transition|version/);
  });

  it('gives every threshold a denominator floor, so a tiny population cannot fire one', () => {
    for (const threshold of ALERT_THRESHOLDS) {
      expect(threshold.minimumDenominator).toBeGreaterThan(1);
    }
  });

  it('uses alert keys the alert_firings format check accepts', () => {
    for (const threshold of ALERT_THRESHOLDS) {
      expect(threshold.key).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });
});

describe('observedRate', () => {
  it('treats an empty window as 0, never NaN', () => {
    expect(observedRate({ label: null, numerator: 0, denominator: 0 })).toBe(0);
  });

  it('computes the plain ratio otherwise', () => {
    expect(observedRate({ label: null, numerator: 3, denominator: 12 })).toBe(0.25);
  });
});

describe('evaluatePopulation', () => {
  it('fires when the rate is strictly above the threshold and the population is big enough', () => {
    const result = evaluatePopulation(
      rateLimitThreshold,
      { label: 'req-submit', numerator: 6, denominator: 100 },
      { now: NOW },
    );
    expect(result.observedRate).toBe(0.06);
    expect(result.suppressedBy).toBeNull();
  });

  it('does not fire exactly at the threshold — the report says "greater than"', () => {
    const result = evaluatePopulation(
      rateLimitThreshold,
      { label: 'req-submit', numerator: 5, denominator: 100 },
      { now: NOW },
    );
    expect(result.observedRate).toBe(0.05);
    expect(result.suppressedBy).toBe('below_threshold');
  });

  it('suppresses a high rate over a tiny population — 1-of-2 is not a 50% incident', () => {
    const result = evaluatePopulation(
      rateLimitThreshold,
      { label: 'req-submit', numerator: 1, denominator: 2 },
      { now: NOW },
    );
    expect(result.observedRate).toBe(0.5);
    expect(result.suppressedBy).toBe('insufficient_data');
  });

  it('suppresses a genuine breach that is still within cooldown', () => {
    const result = evaluatePopulation(
      rateLimitThreshold,
      { label: 'req-submit', numerator: 50, denominator: 100 },
      { lastFiredAt: new Date(NOW.getTime() - 60_000).toISOString(), now: NOW },
    );
    expect(result.suppressedBy).toBe('cooldown');
  });

  it('fires again once the cooldown has elapsed', () => {
    const result = evaluatePopulation(
      rateLimitThreshold,
      { label: 'req-submit', numerator: 50, denominator: 100 },
      {
        lastFiredAt: new Date(NOW.getTime() - (ALERT_COOLDOWN_SECONDS + 60) * 1000).toISOString(),
        now: NOW,
      },
    );
    expect(result.suppressedBy).toBeNull();
  });
});

describe('isWithinCooldown', () => {
  it('is false when nothing has ever fired', () => {
    expect(isWithinCooldown(undefined, NOW)).toBe(false);
  });

  it('treats a future-dated firing as recent, so clock skew stays quiet rather than storms', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    expect(isWithinCooldown(future, NOW)).toBe(true);
  });
});

describe('populationsFromTotals', () => {
  it('produces one population per label, so a busy healthy route cannot mask a quiet broken one', () => {
    const populations = populationsFromTotals({ type: 'counter', kind: 'rate_limit' }, [
      { kind: 'rate_limit', label: 'req-submit', okCount: 10, badCount: 90 },
      { kind: 'rate_limit', label: 'cart-item', okCount: 1000, badCount: 0 },
      { kind: 'provider_call', label: 'meta_event', okCount: 5, badCount: 5 },
    ]);

    expect(populations).toEqual([
      { label: 'req-submit', numerator: 90, denominator: 100 },
      { label: 'cart-item', numerator: 0, denominator: 1000 },
    ]);
  });

  it('returns nothing for an outbox-sourced threshold', () => {
    expect(populationsFromTotals({ type: 'outbox' }, [])).toEqual([]);
  });
});

describe('operational label allowlist', () => {
  it('accepts the rate-limit key prefixes the routes actually use', () => {
    for (const label of OPERATIONAL_LABELS.rate_limit) {
      expect(isOperationalLabel('rate_limit', label)).toBe(true);
    }
  });

  it('rejects a near-miss label, which would otherwise split a rate denominator in two', () => {
    expect(isOperationalLabel('rate_limit', 'request-submit')).toBe(false);
    expect(isOperationalLabel('rate_limit', 'meta_event')).toBe(false);
  });

  it('keeps every label within the database format constraint', () => {
    for (const labels of Object.values(OPERATIONAL_LABELS)) {
      for (const label of labels) expect(label).toMatch(/^[a-z][a-z0-9_-]{0,39}$/);
    }
  });
});

describe('recordOperationalOccurrence', () => {
  it('increments the right minute bucket and reports both outcomes as one population', async () => {
    const store = createInMemoryAlertStore();
    const { logger } = collectingLogger();
    const deps = { store, logger, now: () => NOW };

    await recordOperationalOccurrence(deps, 'rate_limit', 'req-submit', 'ok');
    await recordOperationalOccurrence(deps, 'rate_limit', 'req-submit', 'ok');
    await recordOperationalOccurrence(deps, 'rate_limit', 'req-submit', 'rejected');

    const totals = await store.totalsSince(new Date(NOW.getTime() - 60_000));
    expect(totals).toEqual([{ kind: 'rate_limit', label: 'req-submit', okCount: 2, badCount: 1 }]);
  });

  it('refuses an unknown label and warns, rather than writing a split denominator', async () => {
    const store = createInMemoryAlertStore();
    const { entries, logger } = collectingLogger();

    const recorded = await recordOperationalOccurrence(
      { store, logger, now: () => NOW },
      'rate_limit',
      'totally-made-up',
      'rejected',
    );

    expect(recorded).toBe(false);
    expect(entries[0]?.event).toBe('alerting.occurrence.unknown_label');
    expect(await store.totalsSince(new Date(0))).toEqual([]);
  });

  it('swallows a store failure into false and warns, never throwing at the request path', async () => {
    const { entries, logger } = collectingLogger();
    const failing: AlertStore = {
      ...createInMemoryAlertStore(),
      increment: vi.fn().mockRejectedValue(new Error('down')),
    };

    const recorded = await recordOperationalOccurrence(
      { store: failing, logger, now: () => NOW },
      'rate_limit',
      'req-submit',
      'ok',
    );

    expect(recorded).toBe(false);
    expect(entries[0]?.level).toBe('warn');
    expect(entries[0]?.event).toBe('alerting.occurrence.record_failed');
    expect(entries[0]?.fields).toEqual({
      kind: 'rate_limit',
      label: 'req-submit',
      outcome: 'ok',
      errorType: 'Error',
    });
  });

  it('excludes buckets older than the requested window', async () => {
    const store = createInMemoryAlertStore();
    const { logger } = collectingLogger();
    const old = new Date(NOW.getTime() - 60 * 60 * 1000);

    await recordOperationalOccurrence(
      { store, logger, now: () => old },
      'rate_limit',
      'consent',
      'rejected',
    );
    await recordOperationalOccurrence(
      { store, logger, now: () => NOW },
      'rate_limit',
      'consent',
      'ok',
    );

    const totals = await store.totalsSince(new Date(NOW.getTime() - 5 * 60 * 1000));
    expect(totals).toEqual([{ kind: 'rate_limit', label: 'consent', okCount: 1, badCount: 0 }]);
  });
});

describe('runAlertEvaluation', () => {
  // Shared across every buildDeps call in this describe: the in-memory
  // outbox keys by event id, so a per-call counter would make two runs
  // generate the same id and the second append would overwrite the first.
  let idSeq = 0;

  function buildDeps(overrides: Partial<Parameters<typeof runAlertEvaluation>[0]> = {}) {
    const { entries, logger } = collectingLogger();
    return {
      entries,
      deps: {
        store: createInMemoryAlertStore(),
        outbox: createInMemoryOutboxStore(),
        outboxTotalsSince: () => Promise.resolve({ failed: 0, dispatched: 0 }),
        logger,
        generateId: () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`,
        now: () => NOW,
        ...overrides,
      },
    };
  }

  it('writes nothing at all on a healthy run', async () => {
    const store = createInMemoryAlertStore();
    const outbox = createInMemoryOutboxStore();
    const { deps } = buildDeps({ store, outbox });

    const summary = await runAlertEvaluation(deps);

    expect(summary.firedCount).toBe(0);
    expect(summary.firedKeys).toEqual([]);
    expect(store.firings).toEqual([]);
    expect(await outbox.list()).toEqual([]);
  });

  it('fires the outbox threshold and delivers it through the existing outbox', async () => {
    const store = createInMemoryAlertStore();
    const outbox = createInMemoryOutboxStore();
    const { deps } = buildDeps({
      store,
      outbox,
      // 5 of 100 terminal events failed permanently = 5%, well over 1%.
      outboxTotalsSince: () => Promise.resolve({ failed: 5, dispatched: 100 }),
      thresholds: [outboxThreshold],
    });

    const summary = await runAlertEvaluation(deps);

    expect(summary.firedKeys).toEqual(['outbox_terminal_failure_rate']);
    expect(store.firings).toHaveLength(1);
    expect(store.firings[0]).toMatchObject({
      alertKey: 'outbox_terminal_failure_rate',
      numerator: 5,
      denominator: 100,
      observedRate: 0.05,
      thresholdRate: 0.01,
    });

    const events = await outbox.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.destination).toBe('staff_notification');
    expect(events[0]?.entityType).toBe('OPERATIONAL_ALERT');
    expect(events[0]?.eventType).toBe('ops.alert.fired');
    expect(events[0]?.payload).toMatchObject({
      alertKey: 'outbox_terminal_failure_rate',
      observedRate: 0.05,
      numerator: 5,
      denominator: 100,
    });
  });

  it('never puts a guest identifier or an error string in the notification payload', async () => {
    const outbox = createInMemoryOutboxStore();
    const { deps } = buildDeps({
      outbox,
      outboxTotalsSince: () => Promise.resolve({ failed: 5, dispatched: 100 }),
      thresholds: [outboxThreshold],
    });

    await runAlertEvaluation(deps);
    const payload = (await outbox.list())[0]!.payload as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual([
      'alertKey',
      'denominator',
      'label',
      'numerator',
      'observedRate',
      'summary',
      'thresholdRate',
      'windowSeconds',
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/session|customer|email|phone|lastError/i);
  });

  it('notifies once per incident even when several labels breach together', async () => {
    const store = createInMemoryAlertStore();
    const outbox = createInMemoryOutboxStore();
    const { logger } = collectingLogger();

    for (const label of ['req-submit', 'cart-item', 'consent']) {
      for (let i = 0; i < 30; i += 1) {
        await recordOperationalOccurrence(
          { store, logger, now: () => NOW },
          'rate_limit',
          label,
          'rejected',
        );
      }
    }

    const { deps } = buildDeps({ store, outbox, thresholds: [rateLimitThreshold] });
    const summary = await runAlertEvaluation(deps);

    expect(summary.firedCount).toBe(1);
    // Three routes breached, but it is one rate-limit incident: one record,
    // one notification.
    expect(store.firings).toHaveLength(1);
    expect(await outbox.list()).toHaveLength(1);
  });

  it('stays quiet on the next run while the condition persists, then fires after the cooldown', async () => {
    const store = createInMemoryAlertStore();
    const outbox = createInMemoryOutboxStore();
    const totals = () => Promise.resolve({ failed: 5, dispatched: 100 });

    const first = buildDeps({
      store,
      outbox,
      outboxTotalsSince: totals,
      thresholds: [outboxThreshold],
    });
    expect((await runAlertEvaluation(first.deps)).firedCount).toBe(1);

    const during = buildDeps({
      store,
      outbox,
      outboxTotalsSince: totals,
      thresholds: [outboxThreshold],
      now: () => new Date(NOW.getTime() + 5 * 60 * 1000),
    });
    expect((await runAlertEvaluation(during.deps)).firedCount).toBe(0);
    expect(await outbox.list()).toHaveLength(1);

    const after = buildDeps({
      store,
      outbox,
      outboxTotalsSince: totals,
      thresholds: [outboxThreshold],
      now: () => new Date(NOW.getTime() + (ALERT_COOLDOWN_SECONDS + 60) * 1000),
    });
    expect((await runAlertEvaluation(after.deps)).firedCount).toBe(1);
    expect(await outbox.list()).toHaveLength(2);
  });

  it('keeps evaluating the other thresholds when one source cannot be read', async () => {
    const store = createInMemoryAlertStore();
    const outbox = createInMemoryOutboxStore();
    const { entries, logger } = collectingLogger();

    for (let i = 0; i < 30; i += 1) {
      await recordOperationalOccurrence(
        { store, logger, now: () => NOW },
        'rate_limit',
        'req-submit',
        'rejected',
      );
    }

    const summary = await runAlertEvaluation({
      store,
      outbox,
      outboxTotalsSince: () => Promise.reject(new Error('database unreachable')),
      logger,
      generateId: () => '00000000-0000-4000-8000-000000000001',
      now: () => NOW,
      thresholds: [outboxThreshold, rateLimitThreshold],
    });

    expect(summary.firedKeys).toEqual(['rate_limit_rejection_rate']);
    expect(entries.some((e) => e.event === 'alerting.evaluation.source_failed')).toBe(true);
  });
});

describe('counter retention', () => {
  it('prunes only buckets older than the cutoff', async () => {
    const store = createInMemoryAlertStore();
    const { logger } = collectingLogger();
    const old = new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000);

    await recordOperationalOccurrence(
      { store, logger, now: () => old },
      'rate_limit',
      'consent',
      'ok',
    );
    await recordOperationalOccurrence(
      { store, logger, now: () => NOW },
      'rate_limit',
      'consent',
      'ok',
    );

    const removed = await store.pruneCountersBefore(
      new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000),
    );

    expect(removed).toBe(1);
    expect(await store.totalsSince(new Date(0))).toEqual([
      { kind: 'rate_limit', label: 'consent', okCount: 1, badCount: 0 },
    ]);
  });
});
