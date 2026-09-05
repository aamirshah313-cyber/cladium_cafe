/**
 * `VersionedStore<EventRequestRecord>` over `event_requests`.
 *
 * The third and last of the three request mappings, and the one with the
 * most renames layered on top of the same date/time problem bookings
 * needed.
 *
 * ## Renames
 *
 * `occasion` ↔ `event_type`, `decorInterest` ↔ `decor_requested`. Neither
 * is derivable from the other's name, so a test asserts the whole record
 * round-trips rather than spot-checking fields — the same discipline used
 * for `audit_events`' `targetType`/`targetId`.
 *
 * ## The date/time conversion, again
 *
 * `requestedDate` + `requestedTime` against one `requested_at timestamptz`,
 * solved with `zoned-time.ts` for the same reason as bookings: reading the
 * pair with `new Date()` would use the process timezone, not Abbottabad's.
 * See `postgres-booking-request-store.ts`'s doc comment for the full
 * reasoning — not repeated here.
 *
 * ## `quotedAmountPkr`: buildable for reads, deliberately refused for writes
 *
 * `event_requests_quote_attribution` requires `quoted_by` and `quoted_at`
 * whenever `quoted_amount_pkr` is set — "a quote must record who gave it
 * and when." `EventRequestRecord` has no `quotedBy`/`quotedAt` fields at
 * all: `state-machine.ts`'s own doc comment confirms no submission or
 * staff service for `QUOTED` exists yet, so nothing in this codebase can
 * produce a non-null quote today. `buildEventRequest` hardcodes
 * `quotedAmountPkr: null` at creation, matching that.
 *
 * Reads still resolve the real value, so this store is honest about
 * quotes that exist in the database (written directly, by a future
 * service, or by staff tooling outside this app). Writing a non-null
 * quote through *this* store throws immediately, naming the actual gap,
 * rather than letting the database's own constraint violation surface as
 * an opaque `23514` with no indication that the domain type is short two
 * fields. Not fabricated: an honest limit stated once, in the one place
 * it applies.
 *
 * ## Not mapped
 *
 * `updated_at` (no domain equivalent) and `version` (owned by the
 * `set_row_updated()` trigger) are never written here.
 *
 * `session_id` is a real foreign key into `customer_sessions` — `getSessionId`
 * (passed to `createPostgresVersionedStore`) makes `create()` call
 * `ensureCustomerSessionRow` first, since nothing in this codebase's
 * guest-session layer has ever written that row itself (D-078).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { VersionedStore } from '../domain/versioned-store';
import { instantToZonedDateTime, zonedDateTimeToInstant } from '../business/zoned-time';
import { createPostgresVersionedStore } from './postgres-versioned-store';
import type { EventRequestRecord } from '../../modules/events/request';
import type { EventState } from '../../modules/events/state-machine';
import type { SourceChannel } from '../schemas/common';

assertServerOnly('src/lib/db/postgres-event-request-store.ts');

const TABLE = 'event_requests';

const SELECT =
  'id, version, state, guest_name, guest_phone, event_type, requested_at, guest_count, ' +
  'decor_requested, notes, quoted_amount_pkr, session_id, source_channel, assigned_staff_id, ' +
  'created_at';

interface EventRequestRow {
  readonly id: string;
  readonly version: number;
  readonly state: EventState;
  readonly guest_name: string;
  readonly guest_phone: string;
  readonly event_type: string;
  readonly requested_at: string;
  readonly guest_count: number | null;
  readonly decor_requested: boolean;
  readonly notes: string | null;
  readonly quoted_amount_pkr: number | null;
  readonly session_id: string | null;
  readonly source_channel: SourceChannel;
  readonly assigned_staff_id: string | null;
  readonly created_at: string;
}

function toRecord(row: EventRequestRow): EventRequestRecord {
  const { date, time } = instantToZonedDateTime(new Date(row.requested_at));
  return {
    id: row.id,
    version: row.version,
    state: row.state,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    occasion: row.event_type,
    requestedDate: date,
    requestedTime: time,
    // The column is nullable while the domain requires a number; every
    // write through this adapter (and the schema's own guestCountSchema)
    // supplies one. 0 is a visibly-wrong sentinel for the rare row written
    // outside this adapter, rather than crashing a whole staff queue.
    guestCount: row.guest_count ?? 0,
    decorInterest: row.decor_requested,
    notes: row.notes,
    quotedAmountPkr: row.quoted_amount_pkr,
    // session_id is nullable via `on delete set null` while the domain
    // types it as a string; an orphaned row reports '' rather than
    // crashing an entire staff queue over one deleted session.
    sessionId: row.session_id ?? '',
    sourceChannel: row.source_channel,
    assignedStaffId: row.assigned_staff_id,
    // Postgres renders timestamptz as `+00:00`; the domain always uses
    // `toISOString()`'s `.000Z`. See D-064.
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function refuseQuoteWrite(quotedAmountPkr: number | null | undefined): void {
  if (quotedAmountPkr === null || quotedAmountPkr === undefined) return;
  throw new Error(
    'event_requests: cannot write a non-null quotedAmountPkr — the schema requires quoted_by ' +
      'and quoted_at (event_requests_quote_attribution), and EventRequestRecord carries neither ' +
      'field yet. No submission or staff service produces a quote today (state-machine.ts); this ' +
      'store deliberately refuses rather than letting the database report a bare constraint violation.',
  );
}

export function createPostgresEventRequestStore(
  client: SupabaseClient,
): VersionedStore<EventRequestRecord> {
  return createPostgresVersionedStore<EventRequestRecord, EventRequestRow>({
    client,
    table: TABLE,
    select: SELECT,
    toRecord,
    toInsert: (record) => {
      refuseQuoteWrite(record.quotedAmountPkr);
      return {
        id: record.id,
        state: record.state,
        guest_name: record.guestName,
        guest_phone: record.guestPhone,
        event_type: record.occasion,
        requested_at: zonedDateTimeToInstant(
          record.requestedDate,
          record.requestedTime,
        ).toISOString(),
        guest_count: record.guestCount,
        decor_requested: record.decorInterest,
        notes: record.notes,
        quoted_amount_pkr: null,
        session_id: record.sessionId,
        source_channel: record.sourceChannel,
        assigned_staff_id: record.assignedStaffId,
        created_at: record.createdAt,
      };
    },
    getSessionId: (record) => record.sessionId,
    toPatch: (patch) => {
      refuseQuoteWrite(patch.quotedAmountPkr);

      const columns: Record<string, unknown> = {};
      if (patch.state !== undefined) columns.state = patch.state;
      if (patch.guestName !== undefined) columns.guest_name = patch.guestName;
      if (patch.guestPhone !== undefined) columns.guest_phone = patch.guestPhone;
      if (patch.occasion !== undefined) columns.event_type = patch.occasion;
      if (patch.guestCount !== undefined) columns.guest_count = patch.guestCount;
      if (patch.decorInterest !== undefined) columns.decor_requested = patch.decorInterest;
      if (patch.notes !== undefined) columns.notes = patch.notes;
      if (patch.sourceChannel !== undefined) columns.source_channel = patch.sourceChannel;
      if (patch.assignedStaffId !== undefined) {
        columns.assigned_staff_id = patch.assignedStaffId;
      }
      // quotedAmountPkr === null is allowed through (clearing a quote needs
      // no attribution); refuseQuoteWrite above already rejected non-null.
      if (patch.quotedAmountPkr !== undefined) columns.quoted_amount_pkr = null;

      const hasDate = patch.requestedDate !== undefined;
      const hasTime = patch.requestedTime !== undefined;
      if (hasDate !== hasTime) {
        throw new Error('event_requests: requestedDate and requestedTime must be patched together');
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
