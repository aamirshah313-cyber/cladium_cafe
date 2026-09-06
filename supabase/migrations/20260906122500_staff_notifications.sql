-- Durable staff notifications — the last in-memory leg of the notification
-- pipeline (D-085 made the outbox durable; the sink it delivered into was
-- still a per-process Map, so "DELIVERED" meant a row in one serverless
-- instance's heap that no other instance, deployment, or staff session
-- could see).
--
-- Purely additive: one new table, its policies and grants. No existing
-- table, column, constraint, policy, function, or row is altered or
-- dropped, so there is nothing destructive to stage across releases and
-- nothing to restore on rollback beyond dropping this table.
--
-- ## `id` is the outbox event's id, and that is the idempotency mechanism
--
-- `createStaffNotificationHandler` already passes `event.id` as the
-- notification id and upserts. Making that the primary key here turns the
-- existing contract into a database guarantee: a dispatcher that crashes
-- after the handler succeeded but before marking the outbox row DELIVERED
-- will retry, and the retry collides with the same primary key and updates
-- in place instead of inserting a second notification for the same event.
-- Duplicate suppression therefore survives a process restart, which an
-- application-memory check could never do.
--
-- No foreign key to `outbox_events` on purpose. A notification must outlive
-- the outbox row it came from — outbox rows are operational plumbing and
-- may eventually be pruned or archived, and that must never cascade into
-- deleting, or block deleting, something staff are still reading.
-- `entity_type`/`entity_id` likewise carry the link to the source request
-- without a foreign key, exactly as `outbox_events` itself does, because
-- the target is polymorphic across takeaway/booking/event tables.

create table staff_notifications (
  -- Deliberately not `default gen_random_uuid()`: the value always comes
  -- from the originating outbox event, never invented here.
  id uuid primary key,
  event_type text not null
    constraint staff_notifications_type_format check (event_type ~ '^[a-z][a-z0-9_.]*$'),
  entity_type entity_type not null,
  entity_id uuid not null,
  -- Safe projection only: identifiers and states, never guest contact
  -- details or notes. Same rule the outbox payload follows.
  payload jsonb not null default '{}'::jsonb,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint staff_notifications_version_positive check (version > 0)
);

comment on table staff_notifications is
  'Delivered staff notifications. `id` is the originating outbox_events.id, which makes redelivery idempotent.';

comment on column staff_notifications.id is
  'The outbox event id this was delivered from. Not a foreign key: notifications outlive outbox rows.';

-- The dashboard lists newest first and highlights unread; both are served
-- by this one index.
create index staff_notifications_unread_recent_idx
  on staff_notifications (delivered_at desc)
  include (read_at);

create trigger staff_notifications_set_updated
  before update on staff_notifications
  for each row execute function set_row_updated();

-- ------------------------------------------------------------------ RLS ---
alter table staff_notifications enable row level security;

-- Every signed-in, ACTIVE staff member may read these: a new booking or
-- event request is relevant across roles, unlike an entity-scoped
-- transition or assignment. `is_staff()` is the existing predicate for
-- exactly that, and it excludes suspended accounts.
--
-- No anon policy and no anon grant, so a guest — who reaches Postgres only
-- through the anon key — cannot read a single row.
create policy staff_notifications_staff_read on staff_notifications
  for select to authenticated
  using (is_staff());

-- Deliberately no insert/update/delete policy. These rows are written only
-- by the dispatcher through the service role, which bypasses RLS — the same
-- worker-owned posture `outbox_events` and `webhook_events` already use
-- ("nobody but the service writes"). Marking a notification read goes
-- through the authenticated staff API, which checks the staff session and
-- then writes with the service role, so no direct table write needs to be
-- granted to `authenticated` at all.

-- Both grants are explicit and both are required. `20260830044140_fix_
-- default_table_privileges.sql` revokes the platform's automatic grants for
-- *every future table* — deliberately including `service_role` — so a new
-- table starts with no access for anyone and each role must be named. A
-- missing `service_role` grant here does not fail loudly at deploy: it
-- surfaces later as `42501` the first time the dispatcher tries to write a
-- notification, which is exactly how it was caught.
--
-- `anon` is named nowhere, so a guest has no grant and no policy: two
-- independent layers between them and this table.
grant select on staff_notifications to authenticated;
grant select, insert, update, delete on staff_notifications to service_role;
