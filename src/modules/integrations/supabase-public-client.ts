/**
 * The one trusted, server-only Supabase client for guest-facing reads —
 * built to close Step 19's guest-facing published-menu read side.
 *
 * Authenticated with `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which is fully
 * RLS-bound (`supabase/migrations/20260824140002_rls_policies.sql`) — that
 * is exactly what a guest-facing read needs: `menu_versions_public_read`/
 * `menu_categories_public_read`/etc. already restrict `anon`/`authenticated`
 * to `published_at is not null` / `publish_state = 'PUBLISHED'` rows, so a
 * draft or approved-but-unpublished version's rows are physically absent
 * from anything this client can query — there is no app-level filter to
 * bypass because the rows never arrive. This is the mirror image of
 * `supabase-admin-client.ts` (service-role, RLS-bypassing, staff-only):
 * guest-facing code must use *this* client and never that one.
 *
 * Never throws at construction — see `supabase-auth-client.ts`'s doc
 * comment for the same "fail only when actually used" reasoning.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../../lib/server-only';
import { parseSupabasePublicCredentials } from '../../lib/env';

assertServerOnly('src/modules/integrations/supabase-public-client.ts');

export function createSupabasePublicClient(): SupabaseClient {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    parseSupabasePublicCredentials();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
