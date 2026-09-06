/**
 * Postgres-backed `StaffNotificationStore` — the last durable leg of the
 * notification pipeline.
 *
 * D-085 made the outbox durable, but the sink it delivered into was still a
 * per-process `Map`: a notification marked `DELIVERED` lived in one
 * serverless instance's heap, so it vanished on recycle and was invisible
 * to every other instance, deployment, and staff session. This adapter is
 * what makes "delivered" mean the thing staff can actually rely on.
 *
 * ## Idempotency is the primary key, not a check-then-write
 *
 * `createStaffNotificationHandler` passes the originating outbox event's
 * `id` as the notification id, and the table declares that column as its
 * primary key. `upsert` with `onConflict: 'id'` therefore collapses a
 * redelivery into an update of the same row. The case this exists for is
 * real: the dispatcher can succeed in the handler and then die before
 * marking the outbox row `DELIVERED`, so the row is reclaimed and handed to
 * a handler again — possibly on a different instance. An in-memory "have I
 * seen this id" set could not survive that; a primary key does.
 *
 * `read_at` is deliberately excluded from the upsert's update. A redelivery
 * must never silently mark a notification unread again after staff have
 * read it, which a naive full-row upsert would do.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { EntityType } from '../domain/status-event';
import type {
  StaffNotification,
  StaffNotificationStore,
} from '../../modules/staff/notification-store';

assertServerOnly('src/lib/db/postgres-staff-notification-store.ts');

const TABLE = 'staff_notifications';
const PAGE_SIZE = 500;
const SELECT = 'id, event_type, entity_type, entity_id, payload, delivered_at, read_at';

interface StaffNotificationRow {
  readonly id: string;
  readonly event_type: string;
  readonly entity_type: EntityType;
  readonly entity_id: string;
  readonly payload: Record<string, unknown> | null;
  readonly delivered_at: string;
  readonly read_at: string | null;
}

/** Postgres renders `timestamptz` as `+00:00`; the domain always uses `toISOString()`'s `.000Z`. See D-064. */
function iso(value: string): string {
  return new Date(value).toISOString();
}

function toRecord(row: StaffNotificationRow): StaffNotification {
  return {
    id: row.id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload ?? {},
    deliveredAt: iso(row.delivered_at),
    readAt: row.read_at === null ? null : iso(row.read_at),
  };
}

export function createPostgresStaffNotificationStore(
  client: SupabaseClient,
): StaffNotificationStore {
  return {
    async upsert(notification) {
      const { error } = await client.from(TABLE).upsert(
        {
          id: notification.id,
          event_type: notification.eventType,
          entity_type: notification.entityType,
          entity_id: notification.entityId,
          payload: notification.payload,
          delivered_at: notification.deliveredAt,
          // `read_at` is not written here — see the module comment on why a
          // redelivery must not resurrect an already-read notification as
          // unread.
        },
        { onConflict: 'id' },
      );
      if (error) {
        throw new Error(`staff notification upsert failed: ${error.code ?? 'unknown'}`);
      }
    },

    async list() {
      const records: StaffNotification[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from(TABLE)
          .select(SELECT)
          .order('delivered_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1)
          .returns<StaffNotificationRow[]>();
        if (error) {
          throw new Error(`staff notification list failed: ${error.code ?? 'unknown'}`);
        }
        const page = data ?? [];
        for (const row of page) records.push(toRecord(row));
        if (page.length < PAGE_SIZE) break;
      }
      return records;
    },

    async markRead(id, now) {
      // Matches the in-memory store's contract: marking an id that does not
      // exist is a no-op, not an error.
      const { error } = await client
        .from(TABLE)
        .update({ read_at: now.toISOString() })
        .eq('id', id);
      if (error) {
        throw new Error(`staff notification markRead failed: ${error.code ?? 'unknown'}`);
      }
    },
  };
}
