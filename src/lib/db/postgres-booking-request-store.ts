/**
 * `VersionedStore<BookingRequestRecord>` over `booking_requests`.
 *
 * Bookings are the first of the three request domains to get a concrete
 * mapping because their only real impedance mismatch is the date/time
 * one below — takeaway additionally needs `menuVersionNumber` resolved to
 * a `menu_versions` foreign key, and events rename several fields on top
 * of the same date/time problem. Those follow separately rather than being
 * guessed at here.
 *
 * ## The one mismatch: two local strings versus one instant
 *
 * The domain carries `requestedDate` (`YYYY-MM-DD`) and `requestedTime`
 * (`HH:MM`); the column is a single `timestamptz`. Those strings are
 * Abbottabad wall-clock time — `hours.ts` and `request-window.ts` already
 * establish that the café's clock, not the server's, is what a guest
 * means — so the conversion goes through `zoned-time.ts` rather than
 * `new Date(...)`, which would read them in the process timezone (UTC on
 * Vercel) and silently store every booking five hours off.
 *
 * ## Not mapped, and why
 *
 * `updated_at` has no domain equivalent (the record carries only
 * `createdAt`), and `version` is owned by the `set_row_updated()` trigger.
 * Neither is written by this module.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { VersionedStore } from '../domain/versioned-store';
import { instantToZonedDateTime, zonedDateTimeToInstant } from '../business/zoned-time';
import { createPostgresVersionedStore } from './postgres-versioned-store';
import type { BookingRequestRecord } from '../../modules/bookings/request';
import type { BookingState } from '../../modules/bookings/state-machine';
import type { SeatingPreference, SourceChannel } from '../schemas/common';

assertServerOnly('src/lib/db/postgres-booking-request-store.ts');

const TABLE = 'booking_requests';

const SELECT =
  'id, version, state, guest_name, guest_phone, requested_at, party_size, ' +
  'seating_preference, notes, session_id, source_channel, assigned_staff_id, created_at';

interface BookingRequestRow {
  readonly id: string;
  readonly version: number;
  readonly state: BookingState;
  readonly guest_name: string;
  readonly guest_phone: string;
  readonly requested_at: string;
  readonly party_size: number;
  readonly seating_preference: SeatingPreference;
  readonly notes: string | null;
  readonly session_id: string | null;
  readonly source_channel: SourceChannel;
  readonly assigned_staff_id: string | null;
  readonly created_at: string;
}

function toRecord(row: BookingRequestRow): BookingRequestRecord {
  const { date, time } = instantToZonedDateTime(new Date(row.requested_at));
  return {
    id: row.id,
    version: row.version,
    state: row.state,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    requestedDate: date,
    requestedTime: time,
    partySize: row.party_size,
    seatingPreference: row.seating_preference,
    notes: row.notes,
    // `session_id` is nullable in the schema (`on delete set null`) while the
    // domain types it as a string. An orphaned row is reported as '' rather
    // than crashing the whole staff queue on one deleted session.
    sessionId: row.session_id ?? '',
    sourceChannel: row.source_channel,
    assignedStaffId: row.assigned_staff_id,
    // Postgres renders timestamptz as `+00:00`; the domain always uses
    // `toISOString()`'s `.000Z`. See D-064.
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createPostgresBookingRequestStore(
  client: SupabaseClient,
): VersionedStore<BookingRequestRecord> {
  return createPostgresVersionedStore<BookingRequestRecord, BookingRequestRow>({
    client,
    table: TABLE,
    select: SELECT,
    toRecord,
    toInsert: (record) => ({
      id: record.id,
      state: record.state,
      guest_name: record.guestName,
      guest_phone: record.guestPhone,
      requested_at: zonedDateTimeToInstant(
        record.requestedDate,
        record.requestedTime,
      ).toISOString(),
      party_size: record.partySize,
      seating_preference: record.seatingPreference,
      notes: record.notes,
      session_id: record.sessionId,
      source_channel: record.sourceChannel,
      assigned_staff_id: record.assignedStaffId,
      created_at: record.createdAt,
    }),
    toPatch: (patch) => {
      const columns: Record<string, unknown> = {};
      if (patch.state !== undefined) columns.state = patch.state;
      if (patch.guestName !== undefined) columns.guest_name = patch.guestName;
      if (patch.guestPhone !== undefined) columns.guest_phone = patch.guestPhone;
      if (patch.partySize !== undefined) columns.party_size = patch.partySize;
      if (patch.seatingPreference !== undefined) {
        columns.seating_preference = patch.seatingPreference;
      }
      if (patch.notes !== undefined) columns.notes = patch.notes;
      if (patch.sourceChannel !== undefined) columns.source_channel = patch.sourceChannel;
      if (patch.assignedStaffId !== undefined) {
        columns.assigned_staff_id = patch.assignedStaffId;
      }
      // Date and time are one column, so a patch touching either has to
      // rewrite both. Patching only one is rejected rather than silently
      // combining it with a stale counterpart read from nowhere.
      const hasDate = patch.requestedDate !== undefined;
      const hasTime = patch.requestedTime !== undefined;
      if (hasDate !== hasTime) {
        throw new Error(
          'booking_requests: requestedDate and requestedTime must be patched together',
        );
      }
      if (hasDate && hasTime) {
        columns.requested_at = zonedDateTimeToInstant(
          patch.requestedDate as string,
          patch.requestedTime as string,
        ).toISOString();
      }
      return columns;
    },
  });
}
