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

export const devAccounts: readonly StaffDevAccount[] = parseStaffDevAccounts();
export const staffDirectory: StaffDirectory = createCompositeStaffDirectory([
  createDevStaffDirectory(devAccounts),
  createSupabaseStaffDirectory(),
]);
export const staffAuthClient: StaffAuthClient = createSupabaseStaffAuthClient();
export const staffNotifications: StaffNotificationStore = createInMemoryStaffNotificationStore();
