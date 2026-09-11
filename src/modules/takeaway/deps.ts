/**
 * Process-lifetime singleton deps for the takeaway API routes.
 *
 * **Durable by default, and it fails rather than degrades.** Every store
 * below is Postgres-backed; the in-memory factory exists for tests and for
 * local development without a database, and is reachable only when
 * `ALLOW_IN_MEMORY_STORES=true` is explicitly set. See
 * `lib/db/durable-storage-policy.ts` for why that default is inverted from
 * the pattern bookings and events use: a takeaway request that lands in a
 * `Map` is an order the guest was told was received and that no member of
 * staff will ever see.
 *
 * ## The submission is one transaction, not five writes
 *
 * `persistSubmission` is the important part of this file. Wiring five
 * Postgres-backed stores in place of five in-memory ones would leave the
 * submission as five independent PostgREST round-trips, where a failure
 * after the first produces a request with no lines, no history, or no outbox
 * event. `createPostgresTakeawaySubmission` replaces all five with a single
 * `takeaway_submit_request` call. The individual stores are still wired
 * because the read side and the staff workspace use them.
 *
 * `outbox` remains the shared singleton from `modules/notifications/deps.ts`
 * — one `outbox_events` table, one dispatcher for all three domains — but it
 * is no longer *written* through on the submission path, because the atomic
 * function inserts the outbox row itself, inside the same transaction as the
 * request it announces.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInMemorySink } from '../../lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../lib/domain/versioned-store';
import { createPostgresConfirmationTokenStore } from '../../lib/db/postgres-confirmation-token-store';
import { createPostgresIdempotencyStore } from '../../lib/db/postgres-idempotency-store';
import { createPostgresTakeawayRequestStore } from '../../lib/db/postgres-takeaway-request-store';
import { createPostgresCartStore } from '../../lib/db/postgres-cart-store';
import { createPostgresTakeawaySubmission } from '../../lib/db/postgres-takeaway-submission';
import {
  createPostgresStatusEventSink,
  createPostgresAuditEventSink,
} from '../../lib/db/postgres-event-sinks';
import { resolveDurableDeps } from '../../lib/db/durable-storage-policy';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import { createLogger } from '../../lib/logging';
import { outboxStore } from '../notifications/deps';
import { getPublishedMenuView } from '../menu/menu-view';
import { createInMemoryCartStore } from './cart-store';
import type { TakeawayHttpDeps } from './http';
import type { TakeawayItemSnapshot, TakeawayRequestRecord } from './request';
import type { SubmitTakeawayRequestResult } from './submission-service';

/** Tests and local development only — see the module comment. */
function createInMemoryTakeawayDeps(): TakeawayHttpDeps {
  return {
    getMenuView: getPublishedMenuView,
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore<SubmitTakeawayRequestResult>(),
    requestStore: createInMemoryVersionedStore<TakeawayRequestRecord>(),
    itemSnapshots: createInMemorySink<TakeawayItemSnapshot>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: outboxStore,
    cartStore: createInMemoryCartStore(),
    // No `persistSubmission`: the sequential path in `submission-service.ts`
    // is correct against `Map`s, where a partial write is not reachable.
    generateId: randomUUID,
  };
}

export function createPostgresTakeawayDeps(client: SupabaseClient): TakeawayHttpDeps {
  return {
    getMenuView: getPublishedMenuView,
    confirmationTokens: createPostgresConfirmationTokenStore(client),
    idempotency: createPostgresIdempotencyStore<SubmitTakeawayRequestResult>({
      client,
      operation: 'submit_takeaway_request',
      entityType: 'takeaway_request',
      toEntityId: (result) => result.requestId,
      fromEntityId: (entityId) => ({ requestId: entityId, state: 'REQUESTED' as const }),
      ttlSeconds: 86_400,
    }),
    requestStore: createPostgresTakeawayRequestStore(client),
    /*
     * `itemSnapshots` has no durable sink of its own and does not need one:
     * the only writer of `takeaway_items` is the atomic submission function,
     * which inserts the lines itself. This sink is never reached on the
     * Postgres path — `persistSubmission` short-circuits it — and is left as
     * an in-memory sink rather than a `throw` so that a future reader of the
     * snapshots is not surprised by a store that only explodes.
     */
    itemSnapshots: createInMemorySink<TakeawayItemSnapshot>(),
    statusEvents: createPostgresStatusEventSink(client),
    auditEvents: createPostgresAuditEventSink(client),
    outbox: outboxStore,
    cartStore: createPostgresCartStore(client),
    persistSubmission: createPostgresTakeawaySubmission(client),
    generateId: randomUUID,
  };
}

let cachedTakeawayDeps: TakeawayHttpDeps | null = null;

/**
 * Constructs the real deps on first use, never at module import — every
 * takeaway route imports this module, and a missing credential would
 * otherwise throw at import time for all of them rather than at the point a
 * request actually needs storage.
 *
 * Unlike `bookings/deps.ts`, a construction failure is **not** absorbed. It
 * throws unless the environment has explicitly opted in to in-memory
 * storage. See `lib/db/durable-storage-policy.ts`.
 */
function resolveTakeawayDeps(): TakeawayHttpDeps {
  if (cachedTakeawayDeps) return cachedTakeawayDeps;
  cachedTakeawayDeps = resolveDurableDeps(
    'The takeaway journey',
    () => createPostgresTakeawayDeps(createSupabaseAdminClient()),
    createInMemoryTakeawayDeps,
    (error) => {
      createLogger().warn('takeaway.deps.in_memory_opt_in', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });
    },
  );
  return cachedTakeawayDeps;
}

/**
 * A stable import every route already uses unchanged. The `Proxy` defers
 * resolution to the first real property access, which only happens inside a
 * request handler.
 */
export const takeawayDeps: TakeawayHttpDeps = new Proxy({} as TakeawayHttpDeps, {
  get(_target, prop, receiver) {
    const deps = resolveTakeawayDeps();
    const value = Reflect.get(deps, prop, receiver);
    return typeof value === 'function' ? value.bind(deps) : value;
  },
});
