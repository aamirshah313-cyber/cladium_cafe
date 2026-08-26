/**
 * The `staff_notification` outbox handler — Runbook Step 25.
 *
 * The only destination any request submission or staff transition writes
 * today (`modules/{takeaway,bookings,events}/submission-service.ts`,
 * `lib/domain/staff-transition.ts`). Idempotent by construction: it upserts
 * by the outbox event's own id, so the dispatcher calling it twice for the
 * same event (see `outbox-dispatcher.ts`'s doc comment) produces the same
 * end state, not a duplicate.
 */

import type { OutboxHandler } from '../../lib/domain/outbox-dispatcher';
import type { StaffNotificationStore } from './notification-store';

export function createStaffNotificationHandler(store: StaffNotificationStore): OutboxHandler {
  return async (event) => {
    await store.upsert({
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
      deliveredAt: new Date().toISOString(),
      readAt: null,
    });
  };
}
