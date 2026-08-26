/**
 * Booking request record shape — Runbook Step 19 (data-model-v2.md
 * `booking_requests`). "A requested time is not availability" — nothing
 * in this shape or the submission service treats `requestedDate`/
 * `requestedTime` as a confirmed slot; only a staff `CONFIRMED` transition
 * does that.
 */

import type { SeatingPreference, SourceChannel } from '../../lib/schemas/common';
import type { VersionedRecord } from '../../lib/domain/versioned-store';
import type { BookingState } from './state-machine';

export type { SeatingPreference };

export interface BookingRequestRecord extends VersionedRecord {
  readonly state: BookingState;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly partySize: number;
  readonly seatingPreference: SeatingPreference;
  readonly notes: string | null;
  readonly sessionId: string;
  readonly sourceChannel: SourceChannel;
  readonly assignedStaffId: string | null;
  readonly createdAt: string;
}
