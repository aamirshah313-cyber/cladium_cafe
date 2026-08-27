/**
 * `getRequestStatus` read tool — Runbook Step 26 (`agent/tool-contracts.md`:
 * "Do not reveal another guest's request").
 *
 * A request ID is opaque and shared across three separate stores
 * (takeaway/booking/event), so this checks all three and returns the one
 * whose `sessionId` matches the caller's own verified session. A request
 * that exists but belongs to someone else is indistinguishable from one
 * that does not exist at all — both resolve to `{ found: false }` — the
 * same "never confirm existence to the wrong caller" reasoning
 * `NOT_FOUND` responses use throughout `lib/domain/`.
 */

import type { VersionedStore } from '../../../lib/domain/versioned-store';
import type { TakeawayRequestRecord } from '../../takeaway/request';
import type { BookingRequestRecord } from '../../bookings/request';
import type { EventRequestRecord } from '../../events/request';

export interface RequestStatusDeps {
  readonly takeawayRequests: VersionedStore<TakeawayRequestRecord>;
  readonly bookingRequests: VersionedStore<BookingRequestRecord>;
  readonly eventRequests: VersionedStore<EventRequestRecord>;
}

export type GetRequestStatusResult =
  | { readonly found: false }
  | {
      readonly found: true;
      readonly requestType: 'TAKEAWAY';
      readonly state: TakeawayRequestRecord['state'];
      readonly createdAt: string;
    }
  | {
      readonly found: true;
      readonly requestType: 'BOOKING';
      readonly state: BookingRequestRecord['state'];
      readonly createdAt: string;
    }
  | {
      readonly found: true;
      readonly requestType: 'EVENT';
      readonly state: EventRequestRecord['state'];
      readonly createdAt: string;
      readonly quotedAmountPkr: number | null;
    };

export async function getRequestStatus(
  deps: RequestStatusDeps,
  sessionId: string,
  requestId: string,
): Promise<GetRequestStatusResult> {
  const takeaway = await deps.takeawayRequests.find(requestId);
  if (takeaway && takeaway.sessionId === sessionId) {
    return {
      found: true,
      requestType: 'TAKEAWAY',
      state: takeaway.state,
      createdAt: takeaway.createdAt,
    };
  }

  const booking = await deps.bookingRequests.find(requestId);
  if (booking && booking.sessionId === sessionId) {
    return {
      found: true,
      requestType: 'BOOKING',
      state: booking.state,
      createdAt: booking.createdAt,
    };
  }

  const event = await deps.eventRequests.find(requestId);
  if (event && event.sessionId === sessionId) {
    return {
      found: true,
      requestType: 'EVENT',
      state: event.state,
      createdAt: event.createdAt,
      quotedAmountPkr: event.quotedAmountPkr,
    };
  }

  return { found: false };
}
