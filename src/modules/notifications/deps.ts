/**
 * Shared outbox store and handler registry — Runbook Step 25.
 *
 * `outbox_events` is one table in data-model-v2.md §6, not one per entity —
 * `modules/{takeaway,bookings,events}/deps.ts` all point their `outbox`
 * field at this single singleton (replacing each entity's own
 * `createInMemorySink()`) so one dispatcher can drain every entity's
 * notifications in one pass, matching the real schema. `handlersByDestination`
 * is keyed by `destination`, not `eventType` — ADR-0007: "the outbox schema
 * is destination/payload-agnostic" — today there is exactly one destination
 * (`staff_notification`); a future channel (e.g. an approved WhatsApp Cloud
 * integration) is an additive registry entry, not a rewrite.
 *
 * This module intentionally depends on `modules/staff/` (for the
 * notification store/handler), not the other way around: entity modules
 * (takeaway/bookings/events) depend on this module for the shared store,
 * and this module depends on staff — never the reverse, so no cycle forms.
 */

import { createInMemoryOutboxStore, type OutboxStore } from '../../lib/domain/outbox-store';
import type { OutboxHandler } from '../../lib/domain/outbox-dispatcher';
import { createStaffNotificationHandler } from '../staff/notification-handlers';
import { staffNotifications } from '../staff/deps';

export const outboxStore: OutboxStore = createInMemoryOutboxStore();

export const handlersByDestination: Readonly<Record<string, OutboxHandler>> = {
  staff_notification: createStaffNotificationHandler(staffNotifications),
};
