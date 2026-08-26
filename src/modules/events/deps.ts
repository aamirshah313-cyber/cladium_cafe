/**
 * Process-lifetime singleton deps for the event API routes — Runbook
 * Step 23.
 *
 * In-memory, not durable — same caveat as `modules/bookings/deps.ts` and
 * `modules/takeaway/deps.ts`. A real Postgres adapter replaces every store
 * this factory builds, later, without any route file needing to change
 * (D-023).
 */

import { randomUUID } from 'node:crypto';
import { createInMemorySink } from '../../lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../lib/domain/versioned-store';
import type { EventRequestRecord } from './request';
import type { EventServiceDeps, SubmitEventRequestResult } from './submission-service';

function createEventDeps(): EventServiceDeps {
  return {
    confirmationTokens: createInMemoryConfirmationTokenStore(),
    idempotency: createInMemoryIdempotencyStore<SubmitEventRequestResult>(),
    requestStore: createInMemoryVersionedStore<EventRequestRecord>(),
    statusEvents: createInMemorySink(),
    auditEvents: createInMemorySink(),
    outbox: createInMemorySink(),
    generateId: randomUUID,
  };
}

export const eventDeps: EventServiceDeps = createEventDeps();
