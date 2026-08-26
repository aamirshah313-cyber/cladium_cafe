/**
 * Outbox dispatch cycle — Runbook Step 25 (ADR-0007).
 *
 * One call = one bounded batch: claim due/stale-claimed rows, invoke the
 * handler registered for each row's `destination`, and resolve every claim
 * to `DELIVERED`, retried with exponential backoff, or `FAILED` (terminal)
 * once `maxAttempts` is reached — never left `CLAIMED` with nothing
 * decided. A handler that always throws (a "poison message") stops being
 * retried once `maxAttempts` is hit, so it can never loop forever; a
 * missing handler for an unknown `destination` fails terminal immediately
 * — no amount of retrying invents a handler.
 *
 * Handlers must be idempotent: `markDelivered` can still fail to be
 * observed by the caller if the process crashes right after the handler
 * succeeds (the same "did it commit" ambiguity any at-least-once delivery
 * system has), so a handler may run again for the same event id on a
 * future cycle. `modules/staff/notification-handlers.ts`'s handler is
 * idempotent by construction (upsert-by-id).
 */

import type { OutboxEvent } from './outbox';
import type { OutboxStore } from './outbox-store';

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

const MAX_LAST_ERROR_LENGTH = 1000; // matches outbox_events_last_error_length.

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown dispatch error';
  return message.slice(0, MAX_LAST_ERROR_LENGTH);
}

export interface RunDispatchCycleInput {
  readonly store: OutboxStore;
  /** Keyed by `OutboxEvent.destination` (ADR-0007: "destination/payload-agnostic"). */
  readonly handlers: Readonly<Record<string, OutboxHandler>>;
  readonly now?: () => Date;
  readonly limit?: number;
  /** How long a claim may sit unresolved before another cycle reclaims it — default 5 minutes. */
  readonly staleClaimMs?: number;
  /** Total attempts allowed (including the first) before a row is terminal — default 5. */
  readonly maxAttempts?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

export interface DispatchCycleSummary {
  readonly claimed: number;
  readonly delivered: number;
  readonly retried: number;
  readonly terminal: number;
}

export async function runDispatchCycle(
  input: RunDispatchCycleInput,
): Promise<DispatchCycleSummary> {
  const now = input.now ?? (() => new Date());
  const limit = input.limit ?? 20;
  const staleClaimMs = input.staleClaimMs ?? 5 * 60 * 1000;
  const maxAttempts = input.maxAttempts ?? 5;
  const baseBackoffMs = input.baseBackoffMs ?? 1000;
  const maxBackoffMs = input.maxBackoffMs ?? 60 * 60 * 1000;

  const batch = await input.store.claimBatch({ limit, now: now(), staleClaimMs });

  let delivered = 0;
  let retried = 0;
  let terminal = 0;

  for (const event of batch) {
    const handler = input.handlers[event.destination];

    if (!handler) {
      await input.store.markTerminal(
        event.id,
        event.version,
        { lastError: `No handler registered for destination "${event.destination}".` },
        now(),
      );
      terminal += 1;
      continue;
    }

    try {
      await handler(event);
      await input.store.markDelivered(event.id, event.version, now());
      delivered += 1;
    } catch (error) {
      const attemptsSoFar = event.attemptCount + 1;
      const lastError = safeErrorMessage(error);
      if (attemptsSoFar >= maxAttempts) {
        await input.store.markTerminal(event.id, event.version, { lastError }, now());
        terminal += 1;
      } else {
        const delayMs = Math.min(baseBackoffMs * 2 ** attemptsSoFar, maxBackoffMs);
        const nextAttemptAt = new Date(now().getTime() + delayMs);
        await input.store.markRetry(event.id, event.version, { nextAttemptAt, lastError }, now());
        retried += 1;
      }
    }
  }

  return { claimed: batch.length, delivered, retried, terminal };
}
