/**
 * The atomic write for a takeaway submission.
 *
 * One `takeaway_submit_request` call, one transaction, five tables. See
 * `supabase/migrations/20260909180000_takeaway_submit_atomic.sql` for why
 * this is a database function rather than five adapter calls: through
 * PostgREST those five are independent HTTP round-trips with nothing holding
 * them together, and a failure part-way leaves a request with no lines, no
 * history, or no outbox event — an order that exists and that staff are
 * never told about.
 *
 * This module deliberately contains no fallback and no partial-success path.
 * If the call fails it throws, `runIdempotent` marks the key FAILED, and the
 * guest is told the submission did not happen — which is then true, because
 * the transaction rolled back.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type {
  TakeawaySubmissionPersistence,
  TakeawaySubmissionWrite,
} from '../../modules/takeaway/submission-service';

assertServerOnly('src/lib/db/postgres-takeaway-submission.ts');

/**
 * Matches `postgres-customer-session.ts`'s convention exactly so the two
 * paths cannot write different hashes for the same session and violate the
 * column's uniqueness. Documented there as a stated simplification: the
 * session id is already the plaintext foreign key on these tables, so
 * hashing it again buys no confidentiality — the column exists so the raw
 * signed cookie never lands in the database, and it does not.
 */
function sessionTokenHash(sessionId: string): string {
  return createHash('sha256').update(sessionId, 'utf8').digest('hex');
}

export function createPostgresTakeawaySubmission(
  client: SupabaseClient,
): TakeawaySubmissionPersistence {
  return {
    async persist(write: TakeawaySubmissionWrite): Promise<void> {
      const { request, items, statusEvent, auditEvent, outboxEvent } = write;

      const { error } = await client.rpc('takeaway_submit_request', {
        p_payload: {
          request: {
            ...request,
            // The function resolves the version *number* to the row's id
            // itself rather than trusting a caller-supplied id.
            sessionTokenHash: sessionTokenHash(request.sessionId),
          },
          items: items.map((item) => ({
            id: item.id,
            // Both are the menu rows' own ids — `MenuViewItem.id` and
            // `MenuViewVariant.id` come straight from `menu_items.id` and
            // `menu_variants.id` (see `modules/menu/guest-view-repository.ts`).
            // The function still checks each against this request's menu
            // version, and still stores null rather than failing when the row
            // is gone: the snapshot's own name and price are the record that
            // matters once the menu has moved on.
            menuItemId: item.menuItemId,
            variantId: item.variantId,
            name: item.name,
            variantLabel: item.variantLabel,
            unitPricePkr: item.unitPricePkr,
            quantity: item.quantity,
            lineTotalPkr: item.lineTotalPkr,
          })),
          statusEvent,
          auditEvent,
          outboxEvent,
        },
      });

      if (error) {
        /*
         * Deliberately terse. The error is surfaced by code, never by
         * message: PostgREST echoes back the offending row in `details` for
         * a constraint violation, and this payload contains a guest's name
         * and phone number.
         */
        throw new Error(`takeaway submission failed: ${error.code ?? 'unknown'}`);
      }
    },
  };
}
