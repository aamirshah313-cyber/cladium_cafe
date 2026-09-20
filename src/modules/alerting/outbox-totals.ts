/**
 * The outbox threshold's numbers, resolved the same way every other store
 * in this codebase is: real Postgres when configured, a safe fallback
 * otherwise.
 *
 * Kept separate from `deps.ts` because it reads `outbox_events` — another
 * module's table, and already the source of truth for its own state.
 * Counting outbox outcomes into `operational_counters` as well would create
 * a second record of the same fact, free to drift from the first.
 *
 * ## The fallback returns zeros, and that is the honest choice
 *
 * With no Supabase client there is no outbox to read. Returning
 * `{ failed: 0, dispatched: 0 }` makes the threshold's denominator fall
 * below its `minimumDenominator`, so it is suppressed as
 * `insufficient_data` rather than evaluated. The alternative — inventing a
 * plausible-looking denominator — would produce a threshold that quietly
 * reports healthy without having looked at anything, which is the specific
 * failure mode `deps.ts` warns about at length.
 */

import { createLogger } from '../../lib/logging';
import { createPostgresOutboxDispatchTotals } from '../../lib/db/postgres-alert-store';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import type { OutboxDispatchTotals } from './run-alert-evaluation';

type TotalsReader = (since: Date) => Promise<OutboxDispatchTotals>;

let cachedReader: TotalsReader | null = null;

function resolveReader(): TotalsReader {
  if (cachedReader) return cachedReader;
  try {
    cachedReader = createPostgresOutboxDispatchTotals(createSupabaseAdminClient());
  } catch (error) {
    createLogger().warn('alerting.outbox_totals.postgres_unavailable', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    cachedReader = () => Promise.resolve({ failed: 0, dispatched: 0 });
  }
  return cachedReader;
}

export function outboxDispatchTotalsSince(since: Date): Promise<OutboxDispatchTotals> {
  return resolveReader()(since);
}
