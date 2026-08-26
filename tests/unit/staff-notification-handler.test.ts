import { describe, expect, it } from 'vitest';
import { buildOutboxEvent } from '../../src/lib/domain/outbox';
import { createInMemoryStaffNotificationStore } from '../../src/modules/staff/notification-store';
import { createStaffNotificationHandler } from '../../src/modules/staff/notification-handlers';

const NOW = new Date('2026-08-27T12:00:00Z');
const generateId = () => 'outbox-1';

function event() {
  return buildOutboxEvent({
    eventType: 'takeaway_request.requested',
    entityType: 'TAKEAWAY_REQUEST',
    entityId: 'req-1',
    payload: { totalPkr: 1000 },
    destination: 'staff_notification',
    generateId,
    now: () => NOW,
  });
}

describe('createStaffNotificationHandler', () => {
  it('writes a notification visible to list()', async () => {
    const store = createInMemoryStaffNotificationStore();
    const handler = createStaffNotificationHandler(store);

    await handler(event());

    const notifications = await store.list();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      id: 'outbox-1',
      eventType: 'takeaway_request.requested',
      entityType: 'TAKEAWAY_REQUEST',
      entityId: 'req-1',
    });
  });

  it('is idempotent — invoking it twice for the same outbox event id produces one notification, not two', async () => {
    const store = createInMemoryStaffNotificationStore();
    const handler = createStaffNotificationHandler(store);
    const outboxEvent = event();

    await handler(outboxEvent);
    await handler(outboxEvent); // simulates the dispatcher redelivering after a crash

    const notifications = await store.list();
    expect(notifications).toHaveLength(1);
  });
});
