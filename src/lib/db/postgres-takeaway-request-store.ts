/**
 * `VersionedStore<TakeawayRequestRecord>` over `takeaway_requests`.
 *
 * The last of the three request mappings, and the awkward one.
 *
 * ## The mismatch: a version *number* against a foreign *key*
 *
 * The domain carries `menuVersionNumber: number` — which menu revision the
 * guest was quoted from — while the column is `menu_version_id uuid not
 * null references menu_versions (id) on delete restrict`. Neither side is
 * wrong: the domain wants the human-meaningful number that appears on a
 * request, and the schema wants referential integrity so a menu version
 * that a live request depends on cannot be deleted.
 *
 * Reads resolve it with a PostgREST embed
 * (`menu_versions(version_number)`), so one query returns the number and
 * `list()` does not become N+1. The embed is unqualified deliberately:
 * `takeaway_requests` has exactly **one** foreign key into `menu_versions`,
 * so there is no ambiguity to disambiguate — unlike
 * `staff_role_memberships`, whose two keys into `staff_profiles` produced a
 * `PGRST201` that cost a long debugging session (D-059). Checked, not
 * assumed.
 *
 * Writes have to go the other way, and there is no embed for that: the id
 * is looked up from the number before the insert. That is one extra
 * round-trip per created request, which is acceptable because a create
 * happens once per submission — and it is a genuine lookup rather than a
 * cache, so a menu version imported after this process started is still
 * found.
 *
 * ## `menuVersionNumber` cannot be patched
 *
 * Which menu revision a request was quoted from is a fact about the moment
 * it was submitted. Changing it would silently re-attribute prices the
 * guest never saw, so a patch touching it throws rather than resolving a
 * new foreign key.
 *
 * ## Not mapped
 *
 * `updated_at` (no domain equivalent) and `version` (owned by the
 * `set_row_updated()` trigger) are never written here. The database also
 * enforces `total_pkr = subtotal_pkr + adjustments_pkr`; the domain
 * supplies all three and an inconsistent trio is rejected rather than
 * quietly stored.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { VersionedStore } from '../domain/versioned-store';
import { createPostgresVersionedStore } from './postgres-versioned-store';
import type { TakeawayRequestRecord } from '../../modules/takeaway/request';
import type { TakeawayState } from '../../modules/takeaway/state-machine';
import type { SourceChannel } from '../schemas/common';

assertServerOnly('src/lib/db/postgres-takeaway-request-store.ts');

const TABLE = 'takeaway_requests';

const SELECT =
  'id, version, state, guest_name, guest_phone, subtotal_pkr, adjustments_pkr, total_pkr, ' +
  'requested_collection_note, notes, session_id, source_channel, assigned_staff_id, ' +
  'created_at, menu_versions(version_number)';

interface TakeawayRequestRow {
  readonly id: string;
  readonly version: number;
  readonly state: TakeawayState;
  readonly guest_name: string;
  readonly guest_phone: string;
  readonly subtotal_pkr: number;
  readonly adjustments_pkr: number;
  readonly total_pkr: number;
  readonly requested_collection_note: string | null;
  readonly notes: string | null;
  readonly session_id: string | null;
  readonly source_channel: SourceChannel;
  readonly assigned_staff_id: string | null;
  readonly created_at: string;
  /** Embedded parent row; `null` would mean the FK was violated, which the schema forbids. */
  readonly menu_versions: { readonly version_number: number } | null;
}

function toRecord(row: TakeawayRequestRow): TakeawayRequestRecord {
  return {
    id: row.id,
    version: row.version,
    state: row.state,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    // The column is NOT NULL with a restrict FK, so the embed can only be
    // absent if the select was changed; 0 is an obviously-wrong sentinel
    // rather than a plausible version number.
    menuVersionNumber: row.menu_versions?.version_number ?? 0,
    subtotalPkr: row.subtotal_pkr,
    adjustmentsPkr: row.adjustments_pkr,
    totalPkr: row.total_pkr,
    requestedCollectionNote: row.requested_collection_note,
    notes: row.notes,
    // `session_id` is nullable via `on delete set null` while the domain
    // types it as a string. An orphaned row reports '' rather than crashing
    // an entire staff queue over one deleted session.
    sessionId: row.session_id ?? '',
    sourceChannel: row.source_channel,
    assignedStaffId: row.assigned_staff_id,
    // Postgres renders timestamptz as `+00:00`; the domain always uses
    // `toISOString()`'s `.000Z`. See D-064.
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createPostgresTakeawayRequestStore(
  client: SupabaseClient,
): VersionedStore<TakeawayRequestRecord> {
  async function menuVersionIdFor(versionNumber: number): Promise<string> {
    const { data, error } = await client
      .from('menu_versions')
      .select('id')
      .eq('version_number', versionNumber)
      .maybeSingle<{ id: string }>();
    if (error) {
      throw new Error(`menu version lookup failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) {
      // Failing loudly here beats a foreign-key violation from the insert,
      // which would report the column rather than the real cause.
      throw new Error(`no menu version with version_number ${versionNumber}`);
    }
    return data.id;
  }

  return createPostgresVersionedStore<TakeawayRequestRecord, TakeawayRequestRow>({
    client,
    table: TABLE,
    select: SELECT,
    toRecord,
    toInsert: async (record) => ({
      id: record.id,
      state: record.state,
      guest_name: record.guestName,
      guest_phone: record.guestPhone,
      menu_version_id: await menuVersionIdFor(record.menuVersionNumber),
      subtotal_pkr: record.subtotalPkr,
      adjustments_pkr: record.adjustmentsPkr,
      total_pkr: record.totalPkr,
      requested_collection_note: record.requestedCollectionNote,
      notes: record.notes,
      session_id: record.sessionId,
      source_channel: record.sourceChannel,
      assigned_staff_id: record.assignedStaffId,
      created_at: record.createdAt,
    }),
    toPatch: (patch) => {
      if (patch.menuVersionNumber !== undefined) {
        throw new Error(
          'takeaway_requests: menuVersionNumber is fixed at submission and cannot be patched',
        );
      }
      const columns: Record<string, unknown> = {};
      if (patch.state !== undefined) columns.state = patch.state;
      if (patch.guestName !== undefined) columns.guest_name = patch.guestName;
      if (patch.guestPhone !== undefined) columns.guest_phone = patch.guestPhone;
      if (patch.subtotalPkr !== undefined) columns.subtotal_pkr = patch.subtotalPkr;
      if (patch.adjustmentsPkr !== undefined) columns.adjustments_pkr = patch.adjustmentsPkr;
      if (patch.totalPkr !== undefined) columns.total_pkr = patch.totalPkr;
      if (patch.requestedCollectionNote !== undefined) {
        columns.requested_collection_note = patch.requestedCollectionNote;
      }
      if (patch.notes !== undefined) columns.notes = patch.notes;
      if (patch.sourceChannel !== undefined) columns.source_channel = patch.sourceChannel;
      if (patch.assignedStaffId !== undefined) {
        columns.assigned_staff_id = patch.assignedStaffId;
      }
      return columns;
    },
  });
}
