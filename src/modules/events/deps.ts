/**
 * Process-lifetime singleton deps for the event API routes — Runbook
 * Step 23.
 *
 * In-memory, not durable — same caveat as `modules/bookings/deps.ts` and
 * `modules/takeaway/deps.ts`. A real Postgres adapter replaces every store
 * this factory builds, later, without any route file needing to change
 * (D-023). `outbox` is the Step 25 shared singleton
 * (`modules/notifications/deps.ts`), not a private sink — `outbox_events`
 * is one table, not one per entity, so one dispatcher drains all three.
 */

import { randomUUID } from 'node:crypto';
import { createInMemorySink } from '../../lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../lib/domain/versioned-store';
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

export const eventDeps: EventServiceDeps = createEventDeps();
