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
import { createLogger } from '../../lib/logging';

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

// TEMPORARY — D-059 follow-up diagnostic, added to instrument the exact
// failure point in a real production sign-in that kept reporting "Invalid
// email or password" after the password check itself was independently
// confirmed succeeding (Supabase's own `last_sign_in_at` updating on each
// attempt). Logs only Supabase's own safe, non-secret error metadata
// (`code`/`status`/`message` on a Postgrest/Auth error never embeds the
// actual credential value) plus booleans — never the service-role key, the
// queried user id's associated email, or any header/token value;
// `lib/logging.ts`'s redaction would additionally strip any of those even
// if accidentally included. Remove this comment and the two `logger.*`
// calls in `queryStaffProfile` (revert to the version in git history)
// once the real branch is confirmed and, if it's the fix itself, folded
// into a permanent decision rather than left as ad hoc diagnostic noise.
const diagnosticLogger = createLogger();

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
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (constructError) {
    diagnosticLogger.error('staff.directory.admin_client_construction_failed', {
      column,
      errorName: constructError instanceof Error ? constructError.name : typeof constructError,
      internalMessage:
        constructError instanceof Error ? constructError.message : String(constructError),
    });
    return null;
  }
  try {
    const { data, error } = await admin
      .from('staff_profiles')
      .select(STAFF_PROFILE_SELECT)
      .eq(column, value)
      .eq('status', 'ACTIVE')
      .maybeSingle<StaffProfileRow>();
    diagnosticLogger.info('staff.directory.query_result', {
      column,
      hasData: Boolean(data),
      errorCode: error?.code,
      internalMessage: error?.message,
    });
    if (error || !data) return null;
    return toStaffAccount(data);
  } catch (queryError) {
    diagnosticLogger.error('staff.directory.query_threw', {
      column,
      errorName: queryError instanceof Error ? queryError.name : typeof queryError,
      internalMessage: queryError instanceof Error ? queryError.message : String(queryError),
    });
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
