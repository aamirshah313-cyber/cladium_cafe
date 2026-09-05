/**
 * Process-lifetime singleton deps for the booking API routes — Runbook
 * Step 22.
 *
 * In-memory, not durable — same caveat as `modules/takeaway/deps.ts` and
 * `security/rate-limit.ts`'s in-memory adapter. A real Postgres adapter
 * replaces every store this factory builds, later, without any route file
 * needing to change (D-023). `outbox` is the Step 25 shared singleton
 * (`modules/notifications/deps.ts`), not a private sink — `outbox_events`
 * is one table, not one per entity, so one dispatcher drains all three.
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

export const bookingDeps: BookingServiceDeps = createBookingDeps();

/**
 * The real cutover, built and end-to-end proven (see
 * `tests/integration/bookings-postgres-cutover.test.ts`) but **not wired
 * into `bookingDeps` above** — a deliberate, separate decision from
 * building the adapters, not a mechanical next step.
 *
 * Why not just export this as the live singleton:
 *
 * 1. `bookingDeps` is a **module-level** singleton, constructed once at
 *    import time (`= createBookingDeps()` above). This function's
 *    Postgres-backed equivalent needs a real `SupabaseClient`, and
 *    building one eagerly at import time via
 *    `createSupabaseAdminClient()` would call `parseSupabasePublicCredentials()`/
 *    `parseSupabaseServiceRoleKey()` — both `.parse()` (throwing), not
 *    `.safeParse()` — during module load. This sandbox has no
 *    `.env.local`, so every file importing `modules/bookings/deps.ts`
 *    (all six booking route files) would start throwing at import time,
 *    not just at request time.
 * 2. This repo's `master` branch auto-deploys to the live staging
 *    Vercel project (every commit this session has landed there directly,
 *    with no review gate). Flipping the live singleton is therefore not a
 *    dormant, always-safe addition like every other adapter built so
 *    far — it is the first change in this whole sequence that alters what
 *    the deployed app actually does the moment it is pushed, against the
 *    real staging Supabase project (`vxvpxywszskxcugwpsch`), which this
 *    sandbox cannot reach to verify beforehand (only a separate local
 *    Docker Postgres is reachable here).
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
