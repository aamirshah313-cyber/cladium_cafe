import { describe, expect, it } from 'vitest';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';
import {
  getRequestStatus,
  type RequestStatusDeps,
} from '../../src/modules/concierge/tools/get-request-status';
import type { TakeawayRequestRecord } from '../../src/modules/takeaway/request';
import type { BookingRequestRecord } from '../../src/modules/bookings/request';
import type { EventRequestRecord } from '../../src/modules/events/request';

const NOW = new Date('2026-08-27T12:00:00Z').toISOString();

function harness(): RequestStatusDeps {
  return {
    takeawayRequests: createInMemoryVersionedStore<TakeawayRequestRecord>(),
    bookingRequests: createInMemoryVersionedStore<BookingRequestRecord>(),
    eventRequests: createInMemoryVersionedStore<EventRequestRecord>(),
  };
}

const TAKEAWAY: TakeawayRequestRecord = {
  id: 'req-takeaway-1',
  version: 1,
  state: 'ACCEPTED',
  guestName: 'Aamir',
  guestPhone: '+923001234567',
  menuVersionNumber: 1,
  subtotalPkr: 3500,
  adjustmentsPkr: 0,
  totalPkr: 3500,
  requestedCollectionNote: null,
  notes: null,
  sessionId: 'session-1',
  sourceChannel: 'WEB',
  assignedStaffId: null,
  createdAt: NOW,
};

const BOOKING: BookingRequestRecord = {
  id: 'req-booking-1',
  version: 1,
  state: 'REQUESTED',
  guestName: 'Aamir',
  guestPhone: '+923001234567',
  requestedDate: '2026-08-28',
  requestedTime: '19:00',
  partySize: 4,
  seatingPreference: 'GENERAL',
  notes: null,
  sessionId: 'session-1',
  sourceChannel: 'WEB',
  assignedStaffId: null,
  createdAt: NOW,
};

const EVENT: EventRequestRecord = {
  id: 'req-event-1',
  version: 1,
  state: 'QUOTED',
  guestName: 'Aamir',
  guestPhone: '+923001234567',
  occasion: 'Birthday',
  requestedDate: '2026-08-28',
  requestedTime: '19:00',
  guestCount: 20,
  decorInterest: true,
  notes: null,
  quotedAmountPkr: 15000,
  sessionId: 'session-1',
  sourceChannel: 'WEB',
  assignedStaffId: null,
  createdAt: NOW,
};

describe("getRequestStatus — finds the owner's own request in any of the three stores", () => {
  it('finds a takeaway request', async () => {
    const deps = harness();
    await deps.takeawayRequests.create(TAKEAWAY);
    expect(await getRequestStatus(deps, 'session-1', 'req-takeaway-1')).toEqual({
      found: true,
      requestType: 'TAKEAWAY',
      state: 'ACCEPTED',
      createdAt: NOW,
    });
  });

  it('finds a booking request', async () => {
    const deps = harness();
    await deps.bookingRequests.create(BOOKING);
    expect(await getRequestStatus(deps, 'session-1', 'req-booking-1')).toEqual({
      found: true,
      requestType: 'BOOKING',
      state: 'REQUESTED',
      createdAt: NOW,
    });
  });

  it('finds an event request, including its quoted amount', async () => {
    const deps = harness();
    await deps.eventRequests.create(EVENT);
    expect(await getRequestStatus(deps, 'session-1', 'req-event-1')).toEqual({
      found: true,
      requestType: 'EVENT',
      state: 'QUOTED',
      createdAt: NOW,
      quotedAmountPkr: 15000,
    });
  });
});

describe("getRequestStatus — never reveals another guest's request", () => {
  it("a different session gets found:false for someone else's takeaway request", async () => {
    const deps = harness();
    await deps.takeawayRequests.create(TAKEAWAY);
    expect(await getRequestStatus(deps, 'session-2', 'req-takeaway-1')).toEqual({ found: false });
  });

  it("a different session gets found:false for someone else's booking request", async () => {
    const deps = harness();
    await deps.bookingRequests.create(BOOKING);
    expect(await getRequestStatus(deps, 'session-2', 'req-booking-1')).toEqual({ found: false });
  });

  it('an unknown request id also gets found:false — indistinguishable from wrong-owner', async () => {
    const deps = harness();
    expect(await getRequestStatus(deps, 'session-1', 'no-such-request')).toEqual({ found: false });
  });
});
