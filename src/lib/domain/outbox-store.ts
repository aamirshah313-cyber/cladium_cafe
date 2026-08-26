/**
 * Outbox repository for the dispatcher — Runbook Step 25 (ADR-0007).
 *
 * `claimBatch` is a single atomic operation, not a "read due rows, then
 * write CLAIMED" pair — Step 21 already proved that shape lets two
 * concurrent callers both see the same rows as claimable before either
 * writes back. A real adapter implements this as one conditional
 * `UPDATE ... WHERE status = 'PENDING' AND next_attempt_at <= now() ...
 * RETURNING *` (matching `outbox_events_due_idx`), not a transaction
 * wrapping two separate statements.
 *
 * A claim that is never resolved (the dispatcher process crashed after
 * claiming, before marking delivered/retried/terminal) is reclaimed once
 * `staleClaimMs` has passed — otherwise a single crash would leave that row
 * stuck `CLAIMED` forever, silently un-retried.
 */

import type { OutboxEvent } from './outbox';

export interface ClaimBatchInput {
  readonly limit: number;
  readonly now: Date;
  /** How long a CLAIMED row may sit unresolved before another worker may reclaim it. */
  readonly staleClaimMs: number;
}

export interface MarkRetryInput {
  readonly nextAttemptAt: Date;
  readonly lastError: string;
}

export interface MarkTerminalInput {
  readonly lastError: string;
}

export interface OutboxStore {
  append(event: OutboxEvent): Promise<void>;
  list(): Promise<readonly OutboxEvent[]>;
  /** Atomically claims up to `limit` due (or stale-claimed) rows, oldest first. */
  claimBatch(input: ClaimBatchInput): Promise<readonly OutboxEvent[]>;
  /** `false` on a version mismatch (someone else already resolved this claim). */
  markDelivered(id: string, expectedVersion: number, now: Date): Promise<boolean>;
  markRetry(
    id: string,
    expectedVersion: number,
    input: MarkRetryInput,
    now: Date,
  ): Promise<boolean>;
  markTerminal(
    id: string,
    expectedVersion: number,
    input: MarkTerminalInput,
    now: Date,
  ): Promise<boolean>;
}

export function createInMemoryOutboxStore(): OutboxStore & {
  readonly records: ReadonlyMap<string, OutboxEvent>;
} {
  const records = new Map<string, OutboxEvent>();

  return {
    records,

    async append(event) {
      records.set(event.id, event);
    },

    async list() {
      return [...records.values()];
    },

    async claimBatch({ limit, now, staleClaimMs }) {
      const nowMs = now.getTime();
      const claimable = [...records.values()]
        .filter((event) => {
          if (event.status === 'PENDING') {
            return event.nextAttemptAt !== null && new Date(event.nextAttemptAt).getTime() <= nowMs;
          }
          if (event.status === 'CLAIMED') {
            return (
              event.claimedAt !== null &&
              nowMs - new Date(event.claimedAt).getTime() >= staleClaimMs
            );
          }
          return false;
        })
        .sort((a, b) =>
          (a.nextAttemptAt ?? a.createdAt).localeCompare(b.nextAttemptAt ?? b.createdAt),
        )
        .slice(0, limit);

      const claimed: OutboxEvent[] = [];
      for (const event of claimable) {
        const updated: OutboxEvent = {
          ...event,
          version: event.version + 1,
          status: 'CLAIMED',
          claimedAt: now.toISOString(),
        };
        records.set(event.id, updated);
        claimed.push(updated);
      }
      return claimed;
    },

    async markDelivered(id, expectedVersion, now) {
      const existing = records.get(id);
      if (!existing || existing.version !== expectedVersion) return false;
      records.set(id, {
        ...existing,
        version: existing.version + 1,
        status: 'DELIVERED',
        deliveredAt: now.toISOString(),
        lastError: null,
      });
      return true;
    },

    async markRetry(id, expectedVersion, input, now) {
      const existing = records.get(id);
      if (!existing || existing.version !== expectedVersion) return false;
      records.set(id, {
        ...existing,
        version: existing.version + 1,
        status: 'PENDING',
        attemptCount: existing.attemptCount + 1,
        nextAttemptAt: input.nextAttemptAt.toISOString(),
        claimedAt: null,
        lastError: input.lastError,
      });
      return true;
    },

    async markTerminal(id, expectedVersion, input, now) {
      const existing = records.get(id);
      if (!existing || existing.version !== expectedVersion) return false;
      records.set(id, {
        ...existing,
        version: existing.version + 1,
        status: 'FAILED',
        attemptCount: existing.attemptCount + 1,
        failedAt: now.toISOString(),
        lastError: input.lastError,
      });
      return true;
    },
  };
}
