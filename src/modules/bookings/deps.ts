/**
 * Process-lifetime singleton deps for the booking API routes — Runbook
 * Step 22.
 *
 * In-memory, not durable — same caveat as `modules/takeaway/deps.ts` and
 * `security/rate-limit.ts`'s in-memory adapter. A real Postgres adapter
 * replaces every store this factory builds, later, without any route file
 * needing to change (D-023).
 */

import { randomUUID } from 'node:crypto';
import { createInMemorySink } from '../../lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../lib/domain/versioned-store';
import type { BookingRequestRecord } from './request';
import type { BookingServiceDeps, SubmitBookingRequestResult } from './submission-service';

function createBookingDeps(): BookingServiceDeps {
  return {
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore<SubmitBookingRequestResult>(),
    requestStore: createInMemoryVersionedStore<BookingRequestRecord>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
    generateId: randomUUID,
  };
}

export const bookingDeps: BookingServiceDeps = createBookingDeps();
