/**
 * Development-only staff credential check — Runbook Step 24.
 *
 * This is NOT the production staff auth path — it exists only so the staff
 * workspace built in this step can be signed into and tested without a live
 * Supabase project (D-017). It is fed exclusively by `STAFF_DEV_ACCOUNTS`
 * (`lib/env.server.ts`), which must never be set in production; when unset
 * the account list is empty and every credential check fails, the same
 * fail-closed default `SESSION_SECRET`/CSRF checks use elsewhere in this
 * codebase. The real path is Supabase Auth + MFA for owner/manager
 * (data-model-v2.md §6, release-gates-v2.md Gate 3) — a separate,
 * later integration, not an extension of this module.
 */

import { timingSafeEqual } from 'node:crypto';
import { assertServerOnly } from '../../lib/server-only';
import type { StaffDevAccount } from '../../lib/env.server';

assertServerOnly('src/modules/staff/dev-credentials.ts');

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Returns the matching account's `staffId`, or `null` for any mismatch — never reveals which of staffId/password was wrong. */
export function verifyDevStaffCredentials(
  accounts: readonly StaffDevAccount[],
  staffId: string,
  devPassword: string,
): string | null {
  const account = accounts.find((candidate) => candidate.staffId === staffId);
  if (!account) return null;
  return constantTimeEqual(account.devPassword, devPassword) ? account.staffId : null;
}
