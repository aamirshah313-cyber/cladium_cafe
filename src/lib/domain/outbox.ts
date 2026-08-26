/**
 * Transactional outbox — Runbook Step 19 (data-model-v2.md `outbox_events`).
 *
 * A new outbox row is built in the same call as the business change that
 * causes it, so a real adapter can write both inside one database
 * transaction (data-model-v2.md §7: "add staff notification to the outbox"
 * is the last step of both transaction contracts). `payload` must already
 * be the safe, minimal projection to notify with — never a raw guest note,
 * chat transcript, or provider payload (§8: "Raw provider payloads are not
 * logged; store only required verified fields/digests").
 *
 * A retry worker (bounded exponential backoff, idempotent handlers) is a
 * separate, later concern — this module only builds the row a worker would
 * later claim and deliver.
 */

export type OutboxStatus = 'PENDING' | 'CLAIMED' | 'DELIVERED' | 'FAILED';

export interface OutboxEvent {
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  /** Already-safe notification payload — never raw guest/provider data. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly destination: string;
  readonly status: OutboxStatus;
  readonly attemptCount: number;
  readonly nextAttemptAt: string | null;
  readonly claimedAt: string | null;
  readonly deliveredAt: string | null;
  readonly failedAt: string | null;
  readonly createdAt: string;
}

export interface BuildOutboxEventInput {
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly destination: string;
  readonly now?: () => Date;
}

/** Always builds a fresh row in `PENDING`, zero attempts — a worker claims it later. */
export function buildOutboxEvent(input: BuildOutboxEventInput): OutboxEvent {
  const now = input.now ?? (() => new Date());
  return {
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload,
    destination: input.destination,
    status: 'PENDING',
    attemptCount: 0,
    nextAttemptAt: null,
    claimedAt: null,
    deliveredAt: null,
    failedAt: null,
    createdAt: now().toISOString(),
  };
}
