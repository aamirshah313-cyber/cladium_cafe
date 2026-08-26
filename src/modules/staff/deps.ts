/**
 * Process-lifetime staff directory singleton — Runbook Step 24.
 *
 * Backed by `STAFF_DEV_ACCOUNTS` (development-only fixture, `lib/env.server.ts`
 * — see `dev-credentials.ts`'s doc comment for why). `devAccounts` is kept
 * alongside `directory` because `app/api/staff/session/route.ts` needs the
 * raw list (with `devPassword`) to verify a sign-in attempt, while every
 * other caller only ever needs the role-lookup `StaffDirectory` interface.
 */

import { parseStaffDevAccounts, type StaffDevAccount } from '../../lib/env.server';
import { createDevStaffDirectory, type StaffDirectory } from './directory';

export const devAccounts: readonly StaffDevAccount[] = parseStaffDevAccounts();
export const staffDirectory: StaffDirectory = createDevStaffDirectory(devAccounts);
