/**
 * Process-lifetime singleton deps for the event API routes — Runbook
 * Step 23.
 *
 * **Real Postgres when configured, in-memory otherwise (D-081)** — mirrors
 * `modules/bookings/deps.ts`'s exact shape, built only after that domain's
 * own cutover was proven live (D-077 → D-078 → D-079 → D-080). See
 * `resolveEventDeps`'s own doc comment for the fallback design and its
 * documented limits, and `createPostgresEventDeps`'s for why flipping this
 * is never a small, mechanical step on its own. `outbox` stays the Step 25
 * shared in-memory singleton either way (`modules/notifications/deps.ts`)
 * — `outbox_events` is one table, not one per entity, so one dispatcher
 * drains all three, and switching it is a separate, cross-domain decision
 * belonging to that module, not this one.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInMemorySink } from '../../lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../lib/domain/versioned-store';
import { createPostgresConfirmationTokenStore } from '../../lib/db/postgres-confirmation-token-store';
import { createPostgresIdempotencyStore } from '../../lib/db/postgres-idempotency-store';
import { createPostgresEventRequestStore } from '../../lib/db/postgres-event-request-store';
import {
  createPostgresStatusEventSink,
  createPostgresAuditEventSink,
} from '../../lib/db/postgres-event-sinks';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import { createLogger } from '../../lib/logging';
import { outboxStore } from '../notifications/deps';
import type { EventRequestRecord } from './request';
import type { EventServiceDeps, SubmitEventRequestResult } from './submission-service';

function createEventDeps(): EventServiceDeps {
  return {
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore<SubmitEventRequestResult>(),
    requestStore: createInMemoryVersionedStore<EventRequestRecord>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: outboxStore,
    generateId: randomUUID,
  };
}

let cachedEventDeps: EventServiceDeps | null = null;

/**
 * Constructs the real deps on first actual use (never at module import —
 * every event route file imports this module, and this sandbox's own
 * missing Supabase env vars would otherwise throw at *import* time for all
 * of them, per `createPostgresEventDeps`'s own comment below), then caches
 * it for the rest of the process's life, matching `modules/bookings/deps.ts`'s
 * identical singleton shape.
 *
 * Falls back to the in-memory store on **any** construction failure —
 * missing/broken Supabase credentials, most commonly — rather than letting
 * the request crash. Same reasoning as `modules/bookings/deps.ts`'s
 * `resolveBookingDeps`: an environment that is *supposed* to have real
 * credentials but has a broken one would silently keep "working" against
 * the in-memory store, mitigated (not eliminated) by the `warn` log below;
 * the alternative (let it throw) was rejected for the same reason bookings'
 * was — this sandbox's own unconfigured E2E/dev environments must keep
 * working, not crash the moment Postgres isn't configured.
 *
 * **This fallback only catches construction failures, not a runtime bug
 * reachable once construction succeeds** — the exact class of bug D-078
 * found live in bookings. `createPostgresEventDeps` below is not exposed to
 * that specific bug: `createPostgresEventRequestStore`'s own integration
 * test already proves it calls `ensureCustomerSessionRow` itself before its
 * insert (D-079), the same fix bookings needed, built into this adapter
 * from the start rather than retrofitted after an incident. That test
 * coverage is why this is being enabled directly, without bookings'
 * separate "build it dormant, flip it later" staging.
 */
function resolveEventDeps(): EventServiceDeps {
  if (cachedEventDeps) return cachedEventDeps;
  try {
    cachedEventDeps = createPostgresEventDeps(createSupabaseAdminClient());
  } catch (error) {
    createLogger().warn('events.deps.postgres_unavailable_using_in_memory', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    cachedEventDeps = createEventDeps();
  }
  return cachedEventDeps;
}

/**
 * A stable import that every route file already uses unchanged
 * (`eventDeps.requestStore`, etc.) — the `Proxy` defers actually resolving
 * which implementation backs it until the first real property access,
 * which only ever happens inside a route handler's request-time code,
 * never during module evaluation. Identical pattern to
 * `modules/bookings/deps.ts`'s `bookingDeps`.
 */
export const eventDeps: EventServiceDeps = new Proxy({} as EventServiceDeps, {
  get(_target, prop, receiver) {
    return Reflect.get(resolveEventDeps(), prop, receiver);
  },
});

/**
 * The real, live path (D-081) — `resolveEventDeps` above calls this the
 * first time any route touches `eventDeps`, whenever
 * `createSupabaseAdminClient()` succeeds. Built and end-to-end proven first
 * (see `tests/integration/postgres-event-request-store.test.ts`, which
 * already covers the no-pre-seeded-session case per D-079) before being
 * wired in here.
 *
 * `operation`/`entityType` and the 24-hour `ttlSeconds` follow
 * `postgres-idempotency-store.ts`'s documented contract, matching bookings'
 * own wiring exactly; `ttlSeconds` is written but never interpreted on read
 * (D-065), so this value is informational, not a live expiry.
 */
export function createPostgresEventDeps(client: SupabaseClient): EventServiceDeps {
  return {
    confirmationTokens: createPostgresConfirmationTokenStore(client),
    idempotency: createPostgresIdempotencyStore<SubmitEventRequestResult>({
      client,
      operation: 'submit_event_request',
      entityType: 'event_request',
      toEntityId: (result) => result.requestId,
      fromEntityId: (entityId) => ({ requestId: entityId, state: 'REQUESTED' }),
      ttlSeconds: 86_400,
    }),
    requestStore: createPostgresEventRequestStore(client),
    statusEvents: createPostgresStatusEventSink(client),
    auditEvents: createPostgresAuditEventSink(client),
    /**
     * Deliberately still the in-memory shared singleton, not a Postgres
     * outbox — see `modules/bookings/deps.ts`'s identical note on
     * `createPostgresBookingDeps` for the real, stated consequence of
     * leaving it as-is (a crash between `requestStore.create()` and
     * `outbox.append()` would leave a durable request with no staff
     * notification ever generated). Switching it is a decision belonging to
     * `modules/notifications/deps.ts`, not this one.
     */
    outbox: outboxStore,
    generateId: randomUUID,
  };
}
