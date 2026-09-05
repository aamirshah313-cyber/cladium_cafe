/**
 * Process-lifetime singleton deps for the booking API routes — Runbook
 * Step 22.
 *
 * **Real Postgres when configured, in-memory otherwise (D-077, re-enabled
 * D-080)** — briefly switched on (D-077), emergency-reverted minutes
 * later after a real submission against real staging found a real
 * `customer_sessions` foreign-key gap in the shared guest-session layer
 * (D-078), then re-enabled once that gap was actually fixed for every
 * affected table, not just this one (D-079). See `resolveBookingDeps`'s
 * own doc comment for exactly how the switch is done safely, and
 * `createPostgresBookingDeps`'s for why flipping this is never a small,
 * mechanical step. `outbox` stays the Step 25 shared in-memory singleton
 * either way (`modules/notifications/deps.ts`) — `outbox_events` is one
 * table, not one per entity, so one dispatcher drains all three, and
 * switching it is a separate, cross-domain decision belonging to that
 * module, not this one (see `createPostgresBookingDeps`'s own comment on
 * the real, documented consequence of that).
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInMemorySink } from '../../lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../lib/domain/versioned-store';
import { createPostgresConfirmationTokenStore } from '../../lib/db/postgres-confirmation-token-store';
import { createPostgresIdempotencyStore } from '../../lib/db/postgres-idempotency-store';
import { createPostgresBookingRequestStore } from '../../lib/db/postgres-booking-request-store';
import {
  createPostgresStatusEventSink,
  createPostgresAuditEventSink,
} from '../../lib/db/postgres-event-sinks';
import { createSupabaseAdminClient } from '../integrations/supabase-admin-client';
import { createLogger } from '../../lib/logging';
import { outboxStore } from '../notifications/deps';
import type { BookingRequestRecord } from './request';
import type { BookingServiceDeps, SubmitBookingRequestResult } from './submission-service';

function createBookingDeps(): BookingServiceDeps {
  return {
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore<SubmitBookingRequestResult>(),
    requestStore: createInMemoryVersionedStore<BookingRequestRecord>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: outboxStore,
    generateId: randomUUID,
  };
}

let cachedBookingDeps: BookingServiceDeps | null = null;

/**
 * Constructs the real deps on first actual use (never at module import —
 * every booking route file imports this module, and this sandbox's own
 * missing Supabase env vars would otherwise throw at *import* time for
 * all of them, per `createPostgresBookingDeps`'s own comment below), then
 * caches it for the rest of the process's life, matching every other
 * `deps.ts` singleton's own "construct once" shape.
 *
 * Falls back to the in-memory store on **any** construction failure —
 * missing/broken Supabase credentials, most commonly — rather than
 * letting the request crash. This is a deliberate choice, not the
 * simplest option: an environment that is *supposed* to have real
 * credentials but has a broken one would silently keep "working" against
 * the in-memory store, with no loud failure — durability would quietly
 * stop without anyone being told by a crash. The alternative (let it
 * throw) was rejected because this sandbox's own Playwright E2E suite
 * (`playwright.config.ts`'s `TEST_ENV`) deliberately runs with no
 * Supabase credentials at all, the same as every other unconfigured
 * integration in this project (Vapi/Meta/WhatsApp) — those already
 * gracefully no-op/fail-closed rather than crash, and a real booking
 * route throwing a raw 500 the moment Postgres isn't configured would be
 * the one exception to that pattern, breaking the currently-100%-passing
 * `booking-flow.spec.ts` for no user-facing benefit. The residual risk
 * (silent fallback in a real, meant-to-be-configured environment) is
 * mitigated, not eliminated, by the `warn` log emitted below — real
 * alerting on that log line is a separate, later task once a monitoring
 * stack exists (same standing gap tracked since Step 41).
 *
 * **This fallback only catches construction failures — a real, different
 * runtime bug got through it once already (D-078/D-079):**
 * `createSupabaseAdminClient()` succeeding says nothing about whether a
 * later query inside a real request will succeed. D-077's first attempt
 * crashed live on a foreign-key violation deep inside `save()`, not at
 * construction, so this `try`/`catch` never had a chance to catch it —
 * fixed by making the adapters themselves self-sufficient (D-079's
 * `ensureCustomerSessionRow`), not by widening what this function catches.
 * Re-enabled only after that fix was proven via real-Postgres integration
 * tests that no longer pre-seed a session fixture, and confirmed live
 * against real staging with a genuine booking submission before being
 * reported as working.
 */
function resolveBookingDeps(): BookingServiceDeps {
  if (cachedBookingDeps) return cachedBookingDeps;
  try {
    cachedBookingDeps = createPostgresBookingDeps(createSupabaseAdminClient());
  } catch (error) {
    createLogger().warn('bookings.deps.postgres_unavailable_using_in_memory', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    cachedBookingDeps = createBookingDeps();
  }
  return cachedBookingDeps;
}

/**
 * A stable import that every route file already uses unchanged
 * (`bookingDeps.requestStore`, etc.) — the `Proxy` defers actually
 * resolving which implementation backs it until the first real property
 * access, which only ever happens inside a route handler's request-time
 * code, never during module evaluation.
 */
export const bookingDeps: BookingServiceDeps = new Proxy({} as BookingServiceDeps, {
  get(_target, prop, receiver) {
    return Reflect.get(resolveBookingDeps(), prop, receiver);
  },
});

/**
 * **Now the real, live path** (D-077) — `resolveBookingDeps` above calls
 * this the first time any route touches `bookingDeps`, whenever
 * `createSupabaseAdminClient()` succeeds. Built and end-to-end proven
 * first (see `tests/integration/bookings-postgres-cutover.test.ts`)
 * before ever being wired in — that gap between "built" and "live" was
 * deliberate, not an oversight, for two reasons that still matter even
 * now that it's wired in:
 *
 * 1. Constructing a real `SupabaseClient` calls
 *    `parseSupabasePublicCredentials()`/`parseSupabaseServiceRoleKey()` —
 *    both `.parse()` (throwing), not `.safeParse()`. Doing that eagerly
 *    at module import time (rather than lazily, on first real property
 *    access — see `resolveBookingDeps`) would have made every file
 *    importing `modules/bookings/deps.ts` throw at *import* time in any
 *    environment lacking Supabase env vars, this sandbox included.
 * 2. This repo's `master` branch auto-deploys to the live staging
 *    Vercel project with no review gate — flipping this was the first
 *    change in the whole D-064+ sequence that alters what the deployed
 *    app actually does the moment it is pushed, against the real staging
 *    Supabase project (`vxvpxywszskxcugwpsch`), which this sandbox
 *    cannot reach to verify beforehand (only a separate local Docker
 *    Postgres is reachable here) — proven safe first via the integration
 *    test above, then switched on deliberately, with the graceful
 *    in-memory fallback `resolveBookingDeps` documents.
 * 3. `outbox` stays the shared in-memory singleton on purpose, not an
 *    oversight — see its own note below.
 *
 * `operation`/`entityType` and the 24-hour `ttlSeconds` follow
 * `postgres-idempotency-store.ts`'s documented contract; `ttlSeconds` is
 * written but never interpreted on read (D-065), so this value is
 * informational, not a live expiry.
 */
export function createPostgresBookingDeps(client: SupabaseClient): BookingServiceDeps {
  return {
    confirmationTokens: createPostgresConfirmationTokenStore(client),
    idempotency: createPostgresIdempotencyStore<SubmitBookingRequestResult>({
      client,
      operation: 'submit_booking_request',
      entityType: 'booking_request',
      toEntityId: (result) => result.requestId,
      fromEntityId: (entityId) => ({ requestId: entityId, state: 'REQUESTED' }),
      ttlSeconds: 86_400,
    }),
    requestStore: createPostgresBookingRequestStore(client),
    statusEvents: createPostgresStatusEventSink(client),
    auditEvents: createPostgresAuditEventSink(client),
    /**
     * Deliberately still the in-memory shared singleton, not a Postgres
     * outbox — switching it here would silently change takeaway's and
     * events' notification durability too, since all three domains point
     * at this one object (see the module doc comment). That is a
     * cross-domain decision belonging to `modules/notifications/deps.ts`
     * itself, not something to fold into "the bookings cutover" as a side
     * effect.
     *
     * The real, stated consequence of leaving it as-is: if the process
     * exits between `requestStore.create()` succeeding (durable) and
     * `outbox.append()` running (in-memory), the booking would persist
     * permanently in Postgres with no staff notification ever generated,
     * and no way to reconstruct one after the fact. That risk did not
     * exist while every store was in-memory (a crash lost everything
     * together, so nothing was ever left half-written) — it is new, and
     * specific to this partial cutover. It does not block building and
     * proving this function correct; it does block treating flipping
     * `bookingDeps` to it as a small, safe step.
     */
    outbox: outboxStore,
    generateId: randomUUID,
  };
}
