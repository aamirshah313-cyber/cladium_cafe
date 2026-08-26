/**
 * Transactional outbox — Runbook Step 19 (data-model-v2.md `outbox_events`),
 * claim/retry/terminal fields wired up for a real dispatcher in Step 25
 * (`outbox-store.ts`/`outbox-dispatcher.ts`).
 *
 * A new outbox row is built in the same call as the business change that
 * causes it, so a real adapter can write both inside one database
 * transaction (data-model-v2.md §7: "add staff notification to the outbox"
 * is the last step of both transaction contracts). `payload` must already
 * be the safe, minimal projection to notify with — never a raw guest note,
 * chat transcript, or provider payload (§8: "Raw provider payloads are not
 * logged; store only required verified fields/digests").
 *
 * `id`/`version` make each row individually addressable — ADR-0007's
 * "authenticated dispatcher worker claims and retries entries" needs to
 * name and version-lock one specific row, which nothing before Step 25
 * required (rows were only ever appended and read in bulk).
 */

export type OutboxStatus = 'PENDING' | 'CLAIMED' | 'DELIVERED' | 'FAILED';

export interface OutboxEvent {
  readonly id: string;
  readonly version: number;
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  /** Already-safe notification payload — never raw guest/provider data. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** ADR-0007: "destination/payload-agnostic" — the dispatcher routes on this, never the payload shape. */
  readonly destination: string;
  readonly status: OutboxStatus;
  readonly attemptCount: number;
  readonly nextAttemptAt: string | null;
  readonly claimedAt: string | null;
  readonly deliveredAt: string | null;
  readonly failedAt: string | null;
  readonly lastError: string | null;
  readonly createdAt: string;
}

export interface BuildOutboxEventInput {
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly destination: string;
  readonly generateId: () => string;
  readonly now?: () => Date;
}

/** Always builds a fresh row in `PENDING`, zero attempts, due immediately — a worker claims it later. */
export function buildOutboxEvent(input: BuildOutboxEventInput): OutboxEvent {
  const now = input.now ?? (() => new Date());
  const nowIso = now().toISOString();
  return {
    id: input.generateId(),
    version: 1,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload,
    destination: input.destination,
    status: 'PENDING',
    attemptCount: 0,
    nextAttemptAt: nowIso,
    claimedAt: null,
    deliveredAt: null,
    failedAt: null,
    lastError: null,
    createdAt: nowIso,
  };
}
