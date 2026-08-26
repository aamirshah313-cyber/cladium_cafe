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
 * `createDevStaffDirectory` is the only implementation today, backed by the
 * `STAFF_DEV_ACCOUNTS` fixture (`lib/env.server.ts`) — never real staff
 * data. A real adapter queries `staff_profiles`/role-membership tables
 * instead, once a live Supabase project exists (D-017), without any caller
 * of this interface changing.
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
