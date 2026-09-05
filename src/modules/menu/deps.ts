/**
 * Deps for the staff menu review/publish service — see `admin-service.ts`.
 *
 * Unlike `modules/{takeaway,bookings,events}/deps.ts`, there is no in-memory
 * variant to build here and no cutover decision to defer: `menu_versions`
 * has no domain-layer equivalent at all (Steps 19-25 never modeled menu
 * content the way they modeled requests), so this module is Postgres-backed
 * from the moment it exists. `createSupabaseAdminClient()` is the same
 * server-only, service-role client `modules/staff/supabase-directory.ts`
 * already uses — never exposed to guest-facing code, and this module's
 * writes bypass RLS by the same design choice D-023's audit already made
 * for the domain adapters.
 */

import { assertServerOnly } from '../../lib/server-only';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import type { StaffRole } from '../../lib/schemas/common';

assertServerOnly('src/modules/menu/deps.ts');

/** Matches `MFA_ROLES` in `modules/staff/supabase-credentials.ts` — the same two roles already treated as highest-trust for other sensitive actions. */
export const MENU_STAFF_ROLES: readonly StaffRole[] = ['OWNER', 'MANAGER'];

export function createMenuAdminDeps() {
  return { client: createSupabaseAdminClient() };
}
