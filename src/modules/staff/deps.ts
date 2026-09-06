/**
 * Process-lifetime staff singletons — Runbook Steps 24–25, real auth added
 * Step 45 (D-049).
 *
 * `staffDirectory` is now a composite of the dev fixture and the real
 * Supabase-backed directory (`directory.ts`'s own doc comment explains
 * why this is safe to combine) — every caller downstream of
 * `resolveStaffActor` is unaffected either way, exactly the "without any
 * caller of this interface changing" promise D-028 made. `staffAuthClient`
 * is the real credential-verification adapter
 * (`modules/integrations/supabase-auth-client.ts`); it is only ever
 * exercised by `POST /api/staff/session`'s real-auth branch and the two
 * `/api/staff/mfa/enroll*` routes — never called at all in an environment
 * with no Supabase project configured. `staffNotifications` is unchanged
 * from Step 25: in-memory, not durable, same caveat as every other Step
 * 19–24 singleton (D-023).
 */

import { parseStaffDevAccounts, type StaffDevAccount } from '../../lib/env.server';
import {
  createCompositeStaffDirectory,
  createDevStaffDirectory,
  type StaffDirectory,
} from './directory';
import { createSupabaseStaffDirectory } from './supabase-directory';
import {
  createSupabaseStaffAuthClient,
  type StaffAuthClient,
} from '../integrations/supabase-auth-client';
import {
  createInMemoryStaffNotificationStore,
  type StaffNotificationStore,
} from './notification-store';
import { createPostgresStaffNotificationStore } from '../../lib/db/postgres-staff-notification-store';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import { createLogger } from '../../lib/logging';

export const devAccounts: readonly StaffDevAccount[] = parseStaffDevAccounts();
export const staffDirectory: StaffDirectory = createCompositeStaffDirectory([
  createDevStaffDirectory(devAccounts),
  createSupabaseStaffDirectory(),
]);
export const staffAuthClient: StaffAuthClient = createSupabaseStaffAuthClient();
let cachedStaffNotifications: StaffNotificationStore | null = null;

/**
 * Constructs the real store on first use, never at module import — every
 * staff route imports this module, and an import-time
 * `createSupabaseAdminClient()` would throw for all of them in any
 * environment without Supabase credentials (unit tests, and the Playwright
 * E2E run, which sets none on purpose). Those keep the in-memory store,
 * which is the intended test isolation.
 *
 * Falls back to in-memory on any construction failure, matching every other
 * cutover in this project (D-077/D-080/D-081/D-085) — including the same
 * caveat: this catches construction, not a runtime query failure inside a
 * later call.
 */
function resolveStaffNotifications(): StaffNotificationStore {
  if (cachedStaffNotifications) return cachedStaffNotifications;
  try {
    cachedStaffNotifications = createPostgresStaffNotificationStore(createSupabaseAdminClient());
  } catch (error) {
    createLogger().warn('staff.notifications.postgres_unavailable_using_in_memory', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    cachedStaffNotifications = createInMemoryStaffNotificationStore();
  }
  return cachedStaffNotifications;
}

/**
 * Stable import for every caller (the outbox handler and the staff
 * notification routes). The `Proxy` defers resolving the implementation
 * until the first real property access, which only happens at request or
 * job time. Methods are bound to the resolved store so `this` can never be
 * the proxy.
 */
export const staffNotifications: StaffNotificationStore = new Proxy({} as StaffNotificationStore, {
  get(_target, prop, receiver) {
    const store = resolveStaffNotifications();
    const value = Reflect.get(store, prop, receiver);
    return typeof value === 'function' ? value.bind(store) : value;
  },
});
