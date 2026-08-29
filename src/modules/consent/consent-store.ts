/**
 * In-memory reference `ConsentEvent` store — Runbook Step 36.
 *
 * `append`/`list` are the same `AppendOnlySink<ConsentEvent>` contract
 * (`lib/domain/sink.ts`, Step 19) every other history ledger uses — no
 * ordinary caller of this store can remove an event, matching the real
 * Postgres table's unconditional append-only trigger. `purgeExpiredBefore`
 * is the one deliberate exception, reserved for the retention job
 * (`retention.ts`) alone — it mirrors the real database's own narrow
 * exception (`purge_expired_consent_events`, migration
 * `20260829150001_consent_retention.sql`), which is likewise reachable
 * only through that one SECURITY DEFINER function, never a raw DELETE. A
 * real Postgres adapter replaces this in-memory store without any caller
 * changing (same D-023 caveat as every other domain store here).
 */

import type { AppendOnlySink } from '../../lib/domain/sink';
import type { ConsentEvent } from '../../lib/domain/consent-event';

export interface ConsentEventStore extends AppendOnlySink<ConsentEvent> {
  /**
   * Removes every event with `occurredAt < cutoff` and returns how many
   * were removed. Retention-job-only — never called from `consent-
   * service.ts`'s ordinary grant/revoke/read paths.
   */
  purgeExpiredBefore(cutoff: Date): Promise<number>;
}

export function createInMemoryConsentEventStore(): ConsentEventStore {
  let events: ConsentEvent[] = [];
  return {
    async append(event: ConsentEvent) {
      events.push(event);
    },
    async list() {
      return [...events];
    },
    async purgeExpiredBefore(cutoff: Date) {
      const cutoffMs = cutoff.getTime();
      const before = events.length;
      events = events.filter((event) => new Date(event.occurredAt).getTime() >= cutoffMs);
      return before - events.length;
    },
  };
}
