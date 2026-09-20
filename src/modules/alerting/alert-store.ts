/**
 * The port the alerting module reads and writes through, plus the in-memory
 * adapter used when Postgres is not configured — the same D-023
 * provider-neutral shape every other domain here follows.
 *
 * Two responsibilities, kept on one port because they are always used
 * together by the evaluation job and never separately: the operational
 * counters that feed a threshold, and the firing records that both provide
 * the cooldown and preserve the evidence afterwards.
 *
 * The in-memory adapter buckets by minute exactly as the SQL function does,
 * so an evaluation over it produces the same numbers — which is what lets
 * the whole evaluation path be tested without a database.
 */

import type {
  OperationalKind,
  OperationalOccurrence,
  OperationalTotals,
} from './operational-event';

export interface RecordedFiring {
  readonly alertKey: string;
  readonly windowSeconds: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly observedRate: number;
  readonly thresholdRate: number;
  readonly firedAt: string;
}

export interface AlertStore {
  /** Increments one minute bucket. Called on the request path, so it must stay cheap. */
  increment(occurrence: OperationalOccurrence, now: Date): Promise<void>;
  /** Per (kind, label) ok/bad totals since a cutoff. */
  totalsSince(since: Date): Promise<readonly OperationalTotals[]>;
  /** Most recent firing timestamp per alert key — the cooldown source. */
  lastFiredAtByKey(): Promise<Readonly<Record<string, string>>>;
  /** Appends a firing. Never updates: the record of why an alert fired is immutable. */
  recordFiring(firing: RecordedFiring): Promise<void>;
  /** Deletes counter buckets older than the cutoff. Returns how many went. */
  pruneCountersBefore(cutoff: Date): Promise<number>;
}

function bucketKey(occurrence: OperationalOccurrence, now: Date): string {
  const minute = new Date(now);
  minute.setSeconds(0, 0);
  return `${minute.toISOString()}|${occurrence.kind}|${occurrence.label}|${occurrence.outcome}`;
}

/** Dev/test-only storage — a per-process Map, with the same bucketing as the SQL function. */
export function createInMemoryAlertStore(): AlertStore & {
  readonly firings: readonly RecordedFiring[];
} {
  const counters = new Map<string, number>();
  const firings: RecordedFiring[] = [];

  return {
    get firings(): readonly RecordedFiring[] {
      return [...firings];
    },

    increment(occurrence, now) {
      const key = bucketKey(occurrence, now);
      counters.set(key, (counters.get(key) ?? 0) + 1);
      return Promise.resolve();
    },

    totalsSince(since) {
      const floor = new Date(since);
      floor.setSeconds(0, 0);

      const grouped = new Map<string, { okCount: number; badCount: number }>();
      for (const [key, count] of counters) {
        const [minute, kind, label, outcome] = key.split('|');
        if (new Date(minute!) < floor) continue;
        const id = `${kind}|${label}`;
        const entry = grouped.get(id) ?? { okCount: 0, badCount: 0 };
        if (outcome === 'ok') entry.okCount += count;
        else entry.badCount += count;
        grouped.set(id, entry);
      }

      return Promise.resolve(
        [...grouped.entries()].map(([id, entry]) => {
          const [kind, label] = id.split('|');
          return {
            kind: kind as OperationalKind,
            label: label!,
            okCount: entry.okCount,
            badCount: entry.badCount,
          };
        }),
      );
    },

    lastFiredAtByKey() {
      const latest: Record<string, string> = {};
      for (const firing of firings) {
        const current = latest[firing.alertKey];
        if (current === undefined || firing.firedAt > current)
          latest[firing.alertKey] = firing.firedAt;
      }
      return Promise.resolve(latest);
    },

    recordFiring(firing) {
      firings.push(firing);
      return Promise.resolve();
    },

    pruneCountersBefore(cutoff) {
      const floor = new Date(cutoff);
      floor.setSeconds(0, 0);
      let removed = 0;
      for (const key of [...counters.keys()]) {
        const [minute] = key.split('|');
        if (new Date(minute!) < floor) {
          counters.delete(key);
          removed += 1;
        }
      }
      return Promise.resolve(removed);
    },
  };
}
