/**
 * The real, Supabase-backed `StaffDirectory` — closes Step 45's staff-auth
 * blocker (D-049), superseding `createDevStaffDirectory` (Step 24,
 * `directory.ts`'s own doc comment named this exact adapter as the future
 * replacement, "without any caller of this interface changing").
 *
 * `staffId` throughout this app is `staff_profiles.id` (its own primary
 * key), never the raw Supabase Auth `user_id` — the same id every other
 * table's staff-referencing foreign keys use (`assigned_staff_id`,
 * `granted_by`, `approved_by`, audit-event `actorId`). `findAccountByAuthUserId`
 * exists only to translate a freshly-authenticated Supabase Auth user id
 * into that profile id once, at sign-in time
 * (`modules/staff/supabase-credentials.ts`) — every other caller
 * (`resolveStaffActor`, and everything downstream of it) only ever sees
 * the profile id, exactly as `StaffDirectory`'s interface already promised.
 */

import { assertServerOnly } from '../../lib/server-only';
import type { StaffRole } from '../../lib/domain/actor';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import { type StaffAccount, type StaffDirectory } from './directory';

assertServerOnly('src/modules/staff/supabase-directory.ts');

interface StaffProfileRow {
  readonly id: string;
  readonly display_name: string;
  readonly staff_role_memberships: readonly { readonly role: StaffRole }[];
}

function toStaffAccount(row: StaffProfileRow): StaffAccount {
  return {
    staffId: row.id,
    displayName: row.display_name,
    roles: row.staff_role_memberships.map((membership) => membership.role),
  };
}

const STAFF_PROFILE_SELECT = 'id, display_name, staff_role_memberships(role)';

/**
 * Every query below fails closed to `null` on *any* error — including
 * Supabase URL/service-role-key being unconfigured at all, since
 * `createSupabaseAdminClient()` throws in that case. This mirrors
 * `verifyDevStaffCredentials`'s "never distinguish a config problem from a
 * genuine not-found" convention, and matters for `deps.ts`'s composite
 * directory: in every environment without real Supabase configured (this
 * sandbox, CI, local dev), this directory must behave as "no accounts
 * exist" rather than crash the lookup for every id the dev directory
 * doesn't recognize.
 */
async function queryStaffProfile(
  column: 'id' | 'user_id',
  value: string,
): Promise<StaffAccount | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('staff_profiles')
      .select(STAFF_PROFILE_SELECT)
      .eq(column, value)
      .eq('status', 'ACTIVE')
      .maybeSingle<StaffProfileRow>();
    if (error || !data) return null;
    return toStaffAccount(data);
  } catch {
    return null;
  }
}

export function createSupabaseStaffDirectory(): StaffDirectory {
  return {
    async findAccount(staffId) {
      return queryStaffProfile('id', staffId);
    },
  };
}

/** `null` when no ACTIVE staff profile is linked to this Supabase Auth user — a real Auth account with no `staff_profiles` row is not staff. */
export async function findStaffAccountByAuthUserId(userId: string): Promise<StaffAccount | null> {
  return queryStaffProfile('user_id', userId);
}
