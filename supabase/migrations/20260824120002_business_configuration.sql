-- Runbook Step 8 — business settings, hours, and feature flags.
-- data-model-v2.md §2.
--
-- No business VALUES are inserted here. The verified 12:00–00:00 Asia/Karachi
-- schedule is data the application reads from published rows, not a fact
-- hard-coded into schema or UI.

-- ---------------------------------------------------------------- settings --
create table business_settings (
  key text primary key
    constraint business_settings_key_format
      check (key ~ '^[a-z][a-z0-9_.]*$'),
  value jsonb not null,
  -- Sensitive/internal settings stay out of the public projection below.
  is_sensitive boolean not null default false,
  description text
    constraint business_settings_description_length check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint business_settings_version_positive check (version > 0)
);

comment on table business_settings is
  'Approved business name, addresses, contact channels, location link, currency, and policy references.';

create index business_settings_public_idx on business_settings (key) where not is_sensitive;

create trigger business_settings_set_updated
  before update on business_settings
  for each row execute function set_row_updated();

-- Public reads are limited to non-sensitive settings (data-model-v2.md §1).
create view public_business_settings
  with (security_invoker = true)
  as select key, value, updated_at
     from business_settings
     where not is_sensitive;

-- ------------------------------------------------------------------- hours --
create table business_hours (
  id uuid primary key default gen_random_uuid(),
  -- 0 = Sunday .. 6 = Saturday
  day_of_week smallint not null
    constraint business_hours_day_range check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  -- Cladium closes at midnight, i.e. the closing time falls on the next day.
  closes_next_day boolean not null default false,
  timezone text not null default 'Asia/Karachi',
  publish_state publish_state not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint business_hours_version_positive check (version > 0),
  constraint business_hours_same_day_order
    check (closes_next_day or closes_at > opens_at),
  constraint business_hours_unique_slot unique (day_of_week, opens_at)
);

comment on table business_hours is
  'Timezone-aware weekly opening hours. closes_next_day covers a midnight close.';

create index business_hours_published_idx on business_hours (day_of_week) where publish_state = 'PUBLISHED';

create trigger business_hours_set_updated
  before update on business_hours
  for each row execute function set_row_updated();

-- Exceptional closures and one-off altered hours.
create table business_hour_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_date date not null unique,
  is_closed boolean not null default true,
  opens_at time,
  closes_at time,
  closes_next_day boolean not null default false,
  reason text
    constraint business_hour_exceptions_reason_length check (char_length(reason) <= 200),
  publish_state publish_state not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint business_hour_exceptions_version_positive check (version > 0),
  -- A closed day carries no hours; an open exception must carry both.
  constraint business_hour_exceptions_hours_consistent
    check (
      (is_closed and opens_at is null and closes_at is null)
      or (not is_closed and opens_at is not null and closes_at is not null)
    ),
  constraint business_hour_exceptions_same_day_order
    check (is_closed or closes_next_day or closes_at > opens_at)
);

create trigger business_hour_exceptions_set_updated
  before update on business_hour_exceptions
  for each row execute function set_row_updated();

-- ----------------------------------------------------------- feature flags --
create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  environment text not null
    constraint feature_flags_environment_allowed
      check (environment in ('development', 'preview', 'production')),
  name text not null
    constraint feature_flags_name_format check (name ~ '^[A-Z][A-Z0-9_]*$'),
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  -- Staff reference; the FK to staff_profiles is added in Step 9 when that
  -- table exists. Left unconstrained rather than pointing at nothing.
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint feature_flags_version_positive check (version > 0),
  constraint feature_flags_unique_per_environment unique (environment, name),
  -- An enabled flag must record who approved it and when.
  constraint feature_flags_enabled_requires_approval
    check (not is_enabled or (approved_by is not null and approved_at is not null))
);

comment on table feature_flags is
  'Server-authoritative, environment-scoped flags. A flag may gate a capability but must never bypass authorization.';

create trigger feature_flags_set_updated
  before update on feature_flags
  for each row execute function set_row_updated();

-- ---------------------------------------------------------------------- RLS --
-- Enabled with no policies: default-deny for anon and authenticated roles.
-- Step 10 adds the public-read and role-scoped staff policies.
alter table business_settings enable row level security;
alter table business_hours enable row level security;
alter table business_hour_exceptions enable row level security;
alter table feature_flags enable row level security;
