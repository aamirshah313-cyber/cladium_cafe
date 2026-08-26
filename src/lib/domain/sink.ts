/**
 * Append-only event sink — Runbook Step 19.
 *
 * The one storage shape shared by `status_events`, `audit_events`, and
 * `outbox_events` (data-model-v2.md §6): every one of them is "append a
 * record, never update or delete it." `async` because a real adapter
 * writes inside a database transaction; the in-memory version used by
 * tests and until a live database is connected is synchronous underneath.
 */

export interface AppendOnlySink<T> {
  append(event: T): Promise<void>;
  /**
   * Every event, unfiltered — Runbook Step 24's staff detail views read a
   * request's status-event history by filtering this by `entityId` above
   * the storage boundary, the same place a real adapter's `WHERE entity_id
   * = ...` would live. Not needed by the outbox dispatcher (Step 25), which
   * only ever appends and drains — but the interface is shared, so every
   * sink gets it.
   */
  list(): Promise<readonly T[]>;
}

export interface InMemorySink<T> extends AppendOnlySink<T> {
  readonly events: readonly T[];
}

export function createInMemorySink<T>(): InMemorySink<T> {
  const events: T[] = [];
  return {
    events,
    async append(event: T) {
      events.push(event);
    },
    async list() {
      return [...events];
    },
  };
}
