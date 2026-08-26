/**
 * Delivered staff notifications — Runbook Step 25.
 *
 * What the `staff_notification` outbox destination actually delivers to:
 * no live channel exists yet (no Realtime project — D-017 — and
 * WhatsApp/Meta remain gated off), so "delivered" means "durably visible to
 * the staff dashboard," which `app/api/staff/notifications` polls. This is
 * exactly ADR-0007's own framing — "Realtime is a speed-up, not the
 * delivery guarantee" — applied literally: polling this store IS the
 * guarantee here, and a future Realtime channel would only make it faster
 * to notice, not more reliable.
 *
 * Upserting by the outbox event's own `id` is what makes writing here
 * idempotent: a handler invoked twice for the same event (the dispatcher
 * crashed after the handler succeeded but before marking it `DELIVERED`)
 * overwrites the same entry rather than duplicating it.
 */

export interface StaffNotification {
  readonly id: string;
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly deliveredAt: string;
  readonly readAt: string | null;
}

export interface StaffNotificationStore {
  /** Upsert by `notification.id` — safe to call more than once for the same id. */
  upsert(notification: StaffNotification): Promise<void>;
  list(): Promise<readonly StaffNotification[]>;
  markRead(id: string, now: Date): Promise<void>;
}

export function createInMemoryStaffNotificationStore(): StaffNotificationStore & {
  readonly records: ReadonlyMap<string, StaffNotification>;
} {
  const records = new Map<string, StaffNotification>();

  return {
    records,
    async upsert(notification) {
      records.set(notification.id, notification);
    },
    async list() {
      return [...records.values()].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
    },
    async markRead(id, now) {
      const existing = records.get(id);
      if (!existing) return;
      records.set(id, { ...existing, readAt: now.toISOString() });
    },
  };
}
