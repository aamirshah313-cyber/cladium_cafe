/**
 * Concrete `AppendOnlySink` mappings for `status_events` and
 * `audit_events`, composing `postgres-append-only-sink.ts`.
 *
 * Both are append-only in the database (`forbid_row_change()`), so a write
 * through either of these cannot be undone.
 *
 * ## `status_events` maps cleanly
 *
 * One rename worth naming — the domain's `occurredAt` is the column
 * `created_at` — and `metadata` has no domain equivalent, so the column
 * default covers it. `correlation_id` is a `uuid` column and the domain's
 * `correlationId` is always a validated UUID (`lib/correlation.ts` accepts
 * an inbound header only if it parses as one, otherwise generates a fresh
 * ID), so the types line up rather than merely looking as if they do.
 *
 * ## `audit_events` needed a schema change
 *
 * `AuditEvent.category` had no column at all until
 * `20260904210000_audit_event_category.sql` added one. Two further renames
 * are real and easy to get backwards: the domain's `targetType`/`targetId`
 * are the columns `entity_type`/`entity_id`. `safeDetail` maps to
 * `metadata`, which is NOT NULL with a `{}` default, so a null
 * `safeDetail` is written as `{}` and read back as `null` when empty —
 * the round trip the in-memory store would produce.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '../server-only';
import type { AppendOnlySink } from '../domain/sink';
import type { EntityType, StatusEvent } from '../domain/status-event';
import type { AuditEvent, AuditEventCategory } from '../domain/audit-event';
import type { Actor } from '../domain/actor';
import { createPostgresAppendOnlySink } from './postgres-append-only-sink';

assertServerOnly('src/lib/db/postgres-event-sinks.ts');

const STATUS_SELECT =
  'entity_type, entity_id, previous_state, new_state, actor_type, actor_id, ' +
  'reason_code, reason_note, request_version, correlation_id, created_at';

interface StatusEventRow {
  readonly entity_type: EntityType;
  readonly entity_id: string;
  readonly previous_state: string | null;
  readonly new_state: string;
  readonly actor_type: Actor['type'];
  readonly actor_id: string | null;
  readonly reason_code: string | null;
  readonly reason_note: string | null;
  readonly request_version: number | null;
  readonly correlation_id: string | null;
  readonly created_at: string;
}

export function createPostgresStatusEventSink(client: SupabaseClient): AppendOnlySink<StatusEvent> {
  return createPostgresAppendOnlySink<StatusEvent, StatusEventRow>({
    client,
    table: 'status_events',
    select: STATUS_SELECT,
    orderBy: 'created_at',
    toRecord: (row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      previousState: row.previous_state,
      newState: row.new_state,
      actorType: row.actor_type,
      actorId: row.actor_id,
      reasonCode: row.reason_code,
      reasonNote: row.reason_note,
      // Both columns are nullable in the schema while the domain types them
      // as non-null. Only rows written outside this adapter can be null, and
      // reporting a default beats crashing a whole history read on one.
      requestVersion: row.request_version ?? 0,
      correlationId: row.correlation_id ?? '',
      // Postgres renders timestamptz as `+00:00`; the domain always uses
      // `toISOString()`'s `.000Z`. See D-064.
      occurredAt: new Date(row.created_at).toISOString(),
    }),
    toInsert: (event) => ({
      entity_type: event.entityType,
      entity_id: event.entityId,
      previous_state: event.previousState,
      new_state: event.newState,
      actor_type: event.actorType,
      actor_id: event.actorId,
      reason_code: event.reasonCode,
      reason_note: event.reasonNote,
      request_version: event.requestVersion,
      correlation_id: event.correlationId,
      created_at: event.occurredAt,
    }),
  });
}

const AUDIT_SELECT =
  'category, action, actor_type, actor_id, entity_type, entity_id, ' +
  'correlation_id, metadata, created_at';

interface AuditEventRow {
  readonly category: AuditEventCategory | null;
  readonly action: string;
  readonly actor_type: Actor['type'];
  readonly actor_id: string | null;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly correlation_id: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly created_at: string;
}

export function createPostgresAuditEventSink(client: SupabaseClient): AppendOnlySink<AuditEvent> {
  return createPostgresAppendOnlySink<AuditEvent, AuditEventRow>({
    client,
    table: 'audit_events',
    select: AUDIT_SELECT,
    orderBy: 'created_at',
    toRecord: (row) => ({
      // Null only for rows written before the category column existed.
      category: row.category ?? 'ADMIN',
      action: row.action,
      actorType: row.actor_type,
      actorId: row.actor_id,
      targetType: row.entity_type,
      targetId: row.entity_id,
      // `{}` is how a null safeDetail was stored, so it reads back as null.
      safeDetail: row.metadata && Object.keys(row.metadata).length > 0 ? row.metadata : null,
      correlationId: row.correlation_id ?? '',
      occurredAt: new Date(row.created_at).toISOString(),
    }),
    toInsert: (event) => ({
      category: event.category,
      action: event.action,
      actor_type: event.actorType,
      actor_id: event.actorId,
      entity_type: event.targetType,
      entity_id: event.targetId,
      correlation_id: event.correlationId,
      metadata: event.safeDetail ?? {},
      created_at: event.occurredAt,
    }),
  });
}
