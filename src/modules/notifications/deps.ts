/**
 * Shared outbox store and handler registry — Runbook Step 25.
 *
 * `outbox_events` is one table in data-model-v2.md §6, not one per entity —
 * `modules/{takeaway,bookings,events}/deps.ts` all point their `outbox`
 * field at this single singleton (replacing each entity's own
 * `createInMemorySink()`) so one dispatcher can drain every entity's
 * notifications in one pass, matching the real schema. `handlersByDestination`
 * is keyed by `destination`, not `eventType` — ADR-0007: "the outbox schema
 * is destination/payload-agnostic" — today there is exactly one destination
 * (`staff_notification`); a future channel (e.g. an approved WhatsApp Cloud
 * integration) is an additive registry entry, not a rewrite.
 *
 * This module intentionally depends on `modules/staff/` (for the
 * notification store/handler), not the other way around: entity modules
 * (takeaway/bookings/events) depend on this module for the shared store,
 * and this module depends on staff — never the reverse, so no cycle forms.
 *
 * **Real Postgres when configured, in-memory otherwise (D-085).** Until
 * this cutover the store was unconditionally in-memory, which meant a
 * request could be written durably to Postgres while the notification
 * telling staff about it lived only in one serverless instance's heap —
 * lost on recycle, and invisible to any other instance the scheduled
 * dispatcher happened to land on. `outbox_events` was empty in production
 * despite real bookings having been submitted, which is exactly that
 * failure. `createPostgresBookingDeps`'s own comment called this out as
 * the one remaining gap in the partial cutover; this closes it for all
 * three domains at once, because they share this object.
 */

import { createInMemoryOutboxStore, type OutboxStore } from '../../lib/domain/outbox-store';
import { createPostgresOutboxStore } from '../../lib/db/postgres-outbox-store';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import { resolveDurableDeps } from '../../lib/db/durable-storage-policy';
import { createLogger } from '../../lib/logging';
import type { OutboxHandler } from '../../lib/domain/outbox-dispatcher';
import { createStaffNotificationHandler } from '../staff/notification-handlers';
import { staffNotifications } from '../staff/deps';

let cachedOutboxStore: OutboxStore | null = null;

/**
 * Constructs the real store on first actual use, never at module import.
 * Every entity `deps.ts` imports this module, so an import-time
 * `createSupabaseAdminClient()` would throw for all of them in any
 * environment without Supabase credentials — this sandbox's unit tests and
 * the Playwright E2E run (`playwright.config.ts`'s `TEST_ENV`, which
 * deliberately sets none) included. Those keep the in-memory store and
 * keep passing, which is the intended test/dev isolation: nothing here
 * forces a local test run to require live Postgres.
 *
 * Falls back to in-memory on **any** construction failure, matching
 * `modules/bookings/deps.ts`'s `resolveBookingDeps` exactly, including its
 * caveat: this catches construction, not a runtime query failure inside a
 * later call. The `warn` below is the only signal that a
 * meant-to-be-configured environment quietly lost durability; real
 * alerting on it is the separate, still-open monitoring task.
 */
/**
 * Durable, or it fails — it no longer degrades quietly.
 *
 * This used to catch any construction failure and fall back to an in-memory
 * outbox with a `warn` log. That fallback is invisible from outside, and it
 * is invisible in the worst possible way: the dispatch endpoint keeps
 * returning a healthy `200` with a plausible summary while claiming batches
 * from a per-instance `Map` and never touching Postgres. Real
 * `outbox_events` rows accumulate undelivered behind a green light.
 *
 * That is not hypothetical. When the production dispatcher was found not to
 * be draining anything, this fallback was one of three causes that fitted
 * the evidence equally well, and the only one that would have looked
 * healthy while failing. Making it loud removes it as a possibility rather
 * than leaving it to be ruled out by inference.
 *
 * The in-memory store is still available for tests and for local development
 * without a database, but only when the environment says so explicitly. See
 * `lib/db/durable-storage-policy.ts`.
 */
function resolveOutboxStore(): OutboxStore {
  if (cachedOutboxStore) return cachedOutboxStore;
  cachedOutboxStore = resolveDurableDeps(
    'The notification outbox',
    () => createPostgresOutboxStore(createSupabaseAdminClient()),
    createInMemoryOutboxStore,
    (error) => {
      createLogger().warn('notifications.outbox.in_memory_opt_in', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });
    },
  );
  return cachedOutboxStore;
}

/**
 * The stable import every caller already uses unchanged — all three entity
 * `deps.ts` files and the dispatch route. The `Proxy` defers resolving
 * which implementation backs it until the first real property access,
 * which only happens inside request-time or job-time code. Methods are
 * bound to the resolved store so `this` can never be the proxy itself.
 */
export const outboxStore: OutboxStore = new Proxy({} as OutboxStore, {
  get(_target, prop, receiver) {
    const store = resolveOutboxStore();
    const value = Reflect.get(store, prop, receiver);
    return typeof value === 'function' ? value.bind(store) : value;
  },
});

export const handlersByDestination: Readonly<Record<string, OutboxHandler>> = {
  staff_notification: createStaffNotificationHandler(staffNotifications),
};
