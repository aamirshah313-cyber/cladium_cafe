-- Adds the missing `category` column to `audit_events`.
--
-- `AuditEvent` (src/lib/domain/audit-event.ts) has carried a `category`
-- since Step 19 -- AUTH, ADMIN, MENU_PUBLISHING, FEATURE_CHANGE, EXPORT,
-- PII_ACCESS -- with no column to write it to. The gap surfaced while
-- building the Postgres `AppendOnlySink` adapter, which could not persist
-- the field without either losing it or burying it inside `metadata`.
--
-- A column rather than a jsonb key because this is a compliance artifact:
-- data-model-v2.md describes the table as covering exactly these
-- categories ("authentication-sensitive and administrative activity, menu
-- publishing, feature changes, exports, and PII access"), so "show me every
-- PII_ACCESS event" is a query this table should answer directly and with
-- an index, not one that has to unpack JSON. `metadata` is documented as
-- "redacted, minimal" detail; a classification is not detail.
--
-- Nullable and additive: no existing row is rewritten and no existing
-- statement breaks, keeping the zero-destructive-DDL discipline (D-046).
-- Rows written before this migration legitimately have no category, and a
-- NOT NULL column would have required inventing one for them.

create type audit_event_category as enum (
  'AUTH',
  'ADMIN',
  'MENU_PUBLISHING',
  'FEATURE_CHANGE',
  'EXPORT',
  'PII_ACCESS'
);

alter table audit_events add column category audit_event_category;

comment on column audit_events.category is
  'Classification of the audited activity (data-model-v2.md audit_events). Nullable only because rows predating this column exist; new writes always set it.';

-- Supports "every event in this category, most recent first", the access
-- pattern the categories exist for, and mirrors the existing
-- audit_events_action_idx / audit_events_actor_idx shape.
create index audit_events_category_idx on audit_events (category, created_at desc);
