-- Runbook Step 9 — append-only history, transactional outbox, webhook dedupe,
-- and consent records. data-model-v2.md §6.
--
-- conversation_summaries is deliberately NOT created. The data model marks it
-- optional and says not to enable it until a retention purpose and an
-- owner-approved privacy notice exist. Creating the table would invite use.

create type entity_type as enum (
  'TAKEAWAY_REQUEST', 'BOOKING_REQUEST', 'EVENT_REQUEST', 'MENU_VERSION', 'FEATURE_FLAG'
);

create type outbox_status as enum ('PENDING', 'CLAIMED', 'DELIVERED', 'FAILED');

create type webhook_provider as enum ('VAPI', 'WHATSAPP', 'META');

create type webhook_processing_state as enum ('RECEIVED', 'PROCESSED', 'REJECTED', 'DUPLICATE');

create type consent_category as enum (
  'ESSENTIAL_PREFERENCES', 'META_MARKETING', 'MICROPHONE', 'RECORDING'
);

-- ------------------------------------------------------------ status events -
create table status_events (
  id uuid primary key default gen_random_uuid(),
  entity_type entity_type not null,
  entity_id uuid not null,
  previous_state text,
  new_state text not null
    constraint status_events_new_state_length check (char_length(new_state) between 1 and 60),
  actor_type actor_type not null,
  actor_id uuid,
  reason_code text
    constraint status_events_reason_code_format check (reason_code is null or reason_code ~ '^[A-Z][A-Z0-9_]*$'),
  -- Short, staff-authored. Never guest free text, never chat content.
  reason_note text constraint status_events_reason_note_length check (char_length(reason_note) <= 500),
  request_version integer
    constraint status_events_request_version_positive check (request_version is null or request_version > 0),
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Staff actions must be attributable.
  constraint status_events_staff_attributed
    check (actor_type <> 'STAFF' or actor_id is not null)
);

comment on table status_events is
  'Append-only transition history. Every material state change records actor, reason, request version, and correlation id.';

create index status_events_entity_idx on status_events (entity_type, entity_id, created_at desc);
create index status_events_correlation_idx on status_events (correlation_id);

-- ------------------------------------------------------------- audit events -
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null
    constraint audit_events_action_format check (action ~ '^[a-z][a-z0-9_.]*$'),
  actor_type actor_type not null,
  actor_id uuid,
  entity_type text
    constraint audit_events_entity_type_length check (char_length(entity_type) <= 60),
  entity_id uuid,
  correlation_id uuid,
  -- Redacted, minimal. Never secrets, contact fields, notes, or chat text.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table audit_events is
  'Append-only audit trail for authentication-sensitive and administrative activity, menu publishing, feature changes, exports, and PII access.';

create index audit_events_action_idx on audit_events (action, created_at desc);
create index audit_events_actor_idx on audit_events (actor_id, created_at desc);

-- ------------------------------------------------------------ outbox events -
create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    constraint outbox_events_type_format check (event_type ~ '^[a-z][a-z0-9_.]*$'),
  entity_type entity_type not null,
  entity_id uuid not null,
  destination text not null
    constraint outbox_events_destination_length check (char_length(destination) between 1 and 120),
  -- Safe payload only: identifiers and states, never guest contact details.
  payload jsonb not null default '{}'::jsonb,
  status outbox_status not null default 'PENDING',
  attempt_count integer not null default 0
    constraint outbox_events_attempts_non_negative check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  failed_permanently_at timestamptz,
  last_error text constraint outbox_events_last_error_length check (char_length(last_error) <= 1000),
  correlation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint outbox_events_version_positive check (version > 0),
  constraint outbox_events_delivered_consistent
    check (status <> 'DELIVERED' or delivered_at is not null),
  constraint outbox_events_failed_consistent
    check (status <> 'FAILED' or failed_permanently_at is not null)
);

comment on table outbox_events is
  'Written in the SAME transaction as the business change. A retry worker delivers with bounded exponential backoff; Realtime is a speed-up, not the delivery guarantee.';

-- Drives the dispatcher: oldest due work first.
create index outbox_events_due_idx
  on outbox_events (next_attempt_at)
  where status = 'PENDING';

create trigger outbox_events_set_updated
  before update on outbox_events
  for each row execute function set_row_updated();

-- ----------------------------------------------------------- webhook events -
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider webhook_provider not null,
  -- Vapi supplies toolCallId here; that is what makes tool calls idempotent.
  provider_event_id text not null
    constraint webhook_events_provider_event_id_length
      check (char_length(provider_event_id) between 1 and 200),
  received_at timestamptz not null default now(),
  signature_valid boolean not null,
  timestamp_valid boolean not null,
  processing_state webhook_processing_state not null default 'RECEIVED',
  attempt_count integer not null default 0
    constraint webhook_events_attempts_non_negative check (attempt_count >= 0),
  -- A digest of the verified payload. The raw provider payload is never stored.
  payload_digest text
    constraint webhook_events_digest_length check (payload_digest is null or char_length(payload_digest) between 32 and 128),
  correlation_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint webhook_events_version_positive check (version > 0),
  -- Deduplication: the same provider event is only ever processed once.
  constraint webhook_events_provider_unique unique (provider, provider_event_id),
  -- An unverified event must never be marked processed.
  constraint webhook_events_processed_requires_verification
    check (processing_state <> 'PROCESSED' or (signature_valid and timestamp_valid))
);

comment on table webhook_events is
  'Signature/timestamp verification outcomes and replay protection. Unique (provider, provider_event_id) enforces deduplication.';

create index webhook_events_expiry_idx on webhook_events (expires_at);

create trigger webhook_events_set_updated
  before update on webhook_events
  for each row execute function set_row_updated();

-- ----------------------------------------------------------- consent events -
create table consent_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references customer_sessions (id) on delete set null,
  category consent_category not null,
  granted boolean not null,
  policy_version text not null
    constraint consent_events_policy_version_length check (char_length(policy_version) between 1 and 40),
  source text not null
    constraint consent_events_source_length check (char_length(source) between 1 and 60),
  -- Non-identifying proof metadata only.
  proof jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz not null default now()
);

comment on table consent_events is
  'Append-only consent ledger. Categories are distinct and never bundled: essential preferences, Meta marketing, microphone, and recording.';

create index consent_events_session_idx on consent_events (session_id, category, created_at desc);

-- ------------------------------------------------- append-only enforcement --
create function forbid_row_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '% is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = '23514';
end;
$$;

create trigger status_events_append_only
  before update or delete on status_events
  for each row execute function forbid_row_change();

create trigger audit_events_append_only
  before update or delete on audit_events
  for each row execute function forbid_row_change();

create trigger consent_events_append_only
  before update or delete on consent_events
  for each row execute function forbid_row_change();

-- ---------------------------------------------------------------------- RLS --
alter table status_events enable row level security;
alter table audit_events enable row level security;
alter table outbox_events enable row level security;
alter table webhook_events enable row level security;
alter table consent_events enable row level security;
