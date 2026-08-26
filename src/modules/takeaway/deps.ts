/**
 * Process-lifetime singleton deps for the takeaway API routes — Runbook
 * Step 20.
 *
 * In-memory, not durable — same caveat as `cart-store.ts` and
 * `security/rate-limit.ts`'s in-memory adapter: state is per-process, lost
 * on restart/redeploy, and does not coordinate across concurrent Vercel
 * function instances. A real Postgres adapter replaces every store this
 * factory builds, later, without any route file needing to change (D-023).
 * `outbox` is the Step 25 shared singleton (`modules/notifications/deps.ts`),
 * not a private sink — `outbox_events` is one table, not one per entity, so
 * one dispatcher drains all three.
 */

import { randomUUID } from 'node:crypto';
import { createInMemorySink } from '../../lib/domain/sink';
import { createInMemoryConfirmationTokenStore } from '../../lib/domain/confirmation-token';
import { createInMemoryIdempotencyStore } from '../../lib/domain/idempotency';
import { createInMemoryVersionedStore } from '../../lib/domain/versioned-store';
import { outboxStore } from '../notifications/deps';
import { getPublishedMenuView } from '../menu/menu-view';
import { createInMemoryCartStore } from './cart-store';
import type { TakeawayHttpDeps } from './http';
import type { TakeawayItemSnapshot, TakeawayRequestRecord } from './request';
import type { SubmitTakeawayRequestResult } from './submission-service';

function createTakeawayDeps(): TakeawayHttpDeps {
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
    generateId: randomUUID,
  };
}

export const takeawayDeps: TakeawayHttpDeps = createTakeawayDeps();
