/**
 * Telemetry store wiring — real Postgres when Supabase credentials are
 * configured, in-memory otherwise.
 *
 * Structurally identical to `modules/notifications/deps.ts` (D-085),
 * including why: the store is constructed on first actual use behind a
 * `Proxy`, never at module import. The route that imports this is part of
 * the app's module graph, so an import-time `createSupabaseAdminClient()`
 * would throw in every environment without Supabase credentials — this
 * sandbox's unit tests and the Playwright E2E run (`playwright.config.ts`'s
 * `TEST_ENV`, which deliberately sets none) included.
 *
 * Falls back to in-memory on **any** construction failure, with the same
 * caveat every other `deps.ts` states: this catches construction, not a
 * runtime query failure inside a later call. The `warn` is the only signal
 * that a meant-to-be-configured environment quietly lost durability.
 *
 * The consequence of falling back is milder here than anywhere else in this
 * codebase and worth being explicit about: losing a telemetry sample loses a
 * data point, not a guest's booking. That is exactly why telemetry is safe
 * to ship behind a flag before the alerting work (item 8 of Step 45's punch
 * list) exists to notice the fallback.
 */

import { createLogger } from '../../lib/logging';
import { createPostgresWebVitalsSampleStore } from '../../lib/db/postgres-web-vitals-store';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import { createInMemoryWebVitalsSampleStore, type WebVitalsSampleStore } from './vitals-store';

let cachedStore: WebVitalsSampleStore | null = null;

function resolveStore(): WebVitalsSampleStore {
  if (cachedStore) return cachedStore;
  try {
    cachedStore = createPostgresWebVitalsSampleStore(createSupabaseAdminClient());
  } catch (error) {
    createLogger().warn('telemetry.vitals.postgres_unavailable_using_in_memory', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    cachedStore = createInMemoryWebVitalsSampleStore();
  }
  return cachedStore;
}

/** Methods are bound to the resolved store so `this` can never be the proxy itself. */
export const webVitalsSampleStore: WebVitalsSampleStore = new Proxy({} as WebVitalsSampleStore, {
  get(_target, prop, receiver) {
    const store = resolveStore();
    const value = Reflect.get(store, prop, receiver);
    return typeof value === 'function' ? value.bind(store) : value;
  },
});
