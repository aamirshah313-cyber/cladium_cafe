/**
 * Ensures a `customer_sessions` row exists for a given `sessionId` —
 * closes a real gap found live (D-078): `lib/customer-session.ts#
 * resolveCustomerSession` (Step 20, long before any Postgres adapter
 * existed) only ever signs a bare `randomUUID()` into a cookie; it has
 * never itself written this row. Several tables carry a real foreign key
 * into `customer_sessions(id)` — `confirmation_tokens` (NOT NULL),
 * `carts` (NOT NULL, not built yet), and `booking_requests`/
 * `takeaway_requests`/`event_requests` (nullable columns, but all three
 * adapters write the real `sessionId` value into them, so the FK is still
 * validated) — and every one of them must call this first, defensively,
 * rather than assume the row already exists.
 *
 * `token_hash` here is a deterministic hash of `sessionId` itself, not of
 * the raw signed cookie value the guest actually holds — a stated
 * simplification. The schema's own intent ("only a hash is stored... the
 * raw value never lands in the database") suggests hashing the cookie,
 * but `sessionId` is already the plaintext value stored as a foreign key
 * on every one of these same tables, so hashing it again here buys no
 * additional confidentiality — and threading the raw cookie token down
 * into these low-level adapters (which today only ever receive
 * `sessionId`) would be a materially bigger change than this gap
 * requires. Revisit if `customer_sessions` ever needs to be looked up
 * *by* token rather than by `sessionId` alone.
 *
 * `ON CONFLICT (id) DO NOTHING`: an existing row is left completely
 * untouched (no `last_seen_at` bump, no re-verification) — this function
 * exists only to satisfy the foreign key, not to be `customer_sessions`'
 * real read/write path; building that out (accurate `last_seen_at`,
 * `locale`/`theme` sync, real expiry semantics) is separate, later work.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/db/postgres-customer-session.ts');

/** Matches `lib/security/session.ts`'s own guest-cookie `DEFAULT_TTL_SECONDS`. */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function ensureCustomerSessionRow(
  client: SupabaseClient,
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  const tokenHash = createHash('sha256').update(sessionId, 'utf8').digest('hex');
  const expiresAt = new Date(now.getTime() + DEFAULT_TTL_SECONDS * 1000).toISOString();

  const { error } = await client
    .from('customer_sessions')
    .upsert(
      { id: sessionId, token_hash: tokenHash, expires_at: expiresAt },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  if (error) {
    throw new Error(`customer session ensure failed: ${error.code ?? 'unknown'}`);
  }
}
