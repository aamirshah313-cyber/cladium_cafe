/**
 * Staff account directory — Runbook Step 24.
 *
 * Separates "who is this staff member and what roles do they hold right
 * now" (this module) from "how did they prove who they are" (session
 * verification, `lib/staff-session.ts`). Roles are looked up fresh on every
 * call rather than baked into a signed token, so a role change or account
 * removal takes effect on the very next request — no waiting for a token to
 * expire — the same behavior real-time RLS against `staff_profiles` would
 * give (Step 10's `is_staff`/`staff_has_role` helpers), and the reason a
 * `StaffDirectory` interface exists at all rather than trusting the token.
 *
 * `createDevStaffDirectory` (backed by the `STAFF_DEV_ACCOUNTS` fixture,
 * `lib/env.server.ts`) and `createSupabaseStaffDirectory` (real
 * `staff_profiles`/role-membership data, `modules/staff/
 * supabase-directory.ts` — built Step 45, D-049, closing the gap this
 * comment used to describe as future work) are the two implementations.
 * `createCompositeStaffDirectory` lets `modules/staff/deps.ts` offer both
 * at once without any caller of this interface changing: dev accounts keep
 * working in every environment that sets `STAFF_DEV_ACCOUNTS` (local
 * dev/CI/E2E — never production, unchanged rule), real accounts work
 * wherever they exist, and the two id spaces never collide (dev ids are
 * short human strings; real ids are `staff_profiles` UUIDs).
 */

import { assertServerOnly } from '../../lib/server-only';
import type { StaffRole } from '../../lib/domain/actor';
import type { StaffDevAccount } from '../../lib/env.server';

assertServerOnly('src/modules/staff/directory.ts');

export interface StaffAccount {
  readonly staffId: string;
  readonly displayName: string;
  readonly roles: readonly StaffRole[];
}

export interface StaffDirectory {
  findAccount(staffId: string): Promise<StaffAccount | null>;
}

export function createDevStaffDirectory(accounts: readonly StaffDevAccount[]): StaffDirectory {
  const byId = new Map(accounts.map((account) => [account.staffId, account]));
  return {
    async findAccount(staffId) {
      const account = byId.get(staffId);
      if (!account) return null;
      return { staffId: account.staffId, displayName: account.displayName, roles: account.roles };
    },
  };
}

/** Tries each directory in order, returning the first match — `null` only if none has this `staffId`. */
export function createCompositeStaffDirectory(
  directories: readonly StaffDirectory[],
): StaffDirectory {
  return {
    async findAccount(staffId) {
      for (const directory of directories) {
        const account = await directory.findAccount(staffId);
        if (account) return account;
      }
      return null;
    },
  };
}
