/**
 * Alert store wiring — real Postgres when Supabase credentials are
 * configured, in-memory otherwise. Structurally identical to
 * `modules/notifications/deps.ts` and `modules/telemetry/deps.ts`, for the
 * same reason: the store is constructed on first real use behind a `Proxy`,
 * never at module import, because the request-path call sites that record
 * occurrences are imported in every environment — this sandbox's unit tests
 * and the Playwright run (`playwright.config.ts`'s `TEST_ENV`, which sets no
 * Supabase credentials) included.
 *
 * The in-memory fallback is worth being precise about here, because the
 * consequence is sharper than it is for telemetry. Counters in one
 * instance's heap mean every instance computes a rate over its own slice of
 * traffic, so a real incident spread across instances can sit under the
 * threshold everywhere and alert nowhere. That is a monitoring system that
 * reports healthy while the thing it monitors is broken — worse than no
 * monitoring, because it is trusted.
 *
 * So the `warn` below is not decorative: in a configured environment it is
 * the one signal that alerting has silently degraded. `docs/alerting.md`
 * records it as the thing to check first if alerts go quiet, and the irony
 * that nothing alerts on it is stated there plainly rather than left for
 * someone to discover.
 */

import { createLogger } from '../../lib/logging';
import { createPostgresAlertStore } from '../../lib/db/postgres-alert-store';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import { createInMemoryAlertStore, type AlertStore } from './alert-store';

let cachedStore: AlertStore | null = null;

function resolveStore(): AlertStore {
  if (cachedStore) return cachedStore;
  try {
    cachedStore = createPostgresAlertStore(createSupabaseAdminClient());
  } catch (error) {
    createLogger().warn('alerting.store.postgres_unavailable_using_in_memory', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    cachedStore = createInMemoryAlertStore();
  }
  return cachedStore;
}

/** Methods are bound to the resolved store so `this` can never be the proxy itself. */
export const alertStore: AlertStore = new Proxy({} as AlertStore, {
  get(_target, prop, receiver) {
    const store = resolveStore();
    const value = Reflect.get(store, prop, receiver);
    return typeof value === 'function' ? value.bind(store) : value;
  },
});
