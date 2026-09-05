/**
 * The one trusted, server-only Supabase client used for real staff auth —
 * built alongside `supabase-auth-client.ts` to close Step 45's staff-auth
 * blocker (D-049).
 *
 * Authenticated with `SUPABASE_SERVICE_ROLE_KEY`, which deliberately
 * bypasses RLS (`supabase/migrations/20260824140003_grants.sql`) — that is
 * exactly what a server-only staff-directory lookup needs (guest-facing
 * code must never use this client; RLS is what protects everything else).
 * Used by `modules/staff/supabase-directory.ts` to read `staff_profiles`/
 * `staff_role_memberships`, and by `modules/bookings/deps.ts` to construct
 * the real Postgres-backed booking deps (D-077) when configured — guest-
 * facing domain data for takeaway/events still stays on the in-memory
 * adapters (D-023) until each domain's own cutover is separately decided.
 *
 * Never throws at construction — see `supabase-auth-client.ts`'s doc
 * comment for the same "fail only when actually used" reasoning.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../../lib/server-only';
import { parseSupabasePublicCredentials } from '../../lib/env';
import { parseSupabaseServiceRoleKey } from '../../lib/env.server';

assertServerOnly('src/modules/integrations/supabase-admin-client.ts');

export function createSupabaseAdminClient(): SupabaseClient {
  const { NEXT_PUBLIC_SUPABASE_URL } = parseSupabasePublicCredentials();
  const serviceRoleKey = parseSupabaseServiceRoleKey();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
