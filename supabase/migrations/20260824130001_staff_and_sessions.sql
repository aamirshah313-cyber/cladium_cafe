-- Runbook Step 9 — staff identity, roles, and guest sessions.
-- data-model-v2.md §3, §6.

create type staff_role as enum ('OWNER', 'MANAGER', 'ORDER_STAFF', 'BOOKING_STAFF', 'AUDITOR');
create type staff_status as enum ('ACTIVE', 'SUSPENDED', 'DISABLED');
create type actor_type as enum ('GUEST', 'STAFF', 'SYSTEM');

-- Where a request originated. Voice is split by locale because the two
-- assistants are configured and evaluated independently.
create type source_channel as enum ('WEB', 'TEXT_CONCIERGE', 'VOICE_EN', 'VOICE_UR', 'STAFF');

-- ------------------------------------------------------------ staff ---------
create table staff_profiles (
  id uuid primary key default gen_random_uuid(),
  -- One profile per Supabase Auth user. Restrict rather than cascade: staff
  -- history must not vanish because an auth row was removed.
  user_id uuid not null unique references auth.users (id) on delete restrict,
  display_name text not null
    constraint staff_profiles_display_name_length check (char_length(display_name) between 1 and 120),
  status staff_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint staff_profiles_version_positive check (version > 0)
);

comment on table staff_profiles is
  'Links a Supabase Auth user to Cladium staff status. Guests are never Auth users.';

create trigger staff_profiles_set_updated
  before update on staff_profiles
  for each row execute function set_row_updated();

-- Normalized membership: a person may hold more than one role.
create table staff_role_memberships (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references staff_profiles (id) on delete cascade,
  role staff_role not null,
  granted_by uuid references staff_profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint staff_role_memberships_version_positive check (version > 0),
  constraint staff_role_memberships_unique unique (staff_profile_id, role)
);

create index staff_role_memberships_role_idx on staff_role_memberships (role);

create trigger staff_role_memberships_set_updated
  before update on staff_role_memberships
  for each row execute function set_row_updated();

-- Owner and manager accounts must have MFA enrolled. Enforcement lives in
-- Step 10 policy plus the deployment policy; this view names who is in scope.
create view staff_requiring_mfa
  with (security_invoker = true)
  as select distinct p.id, p.user_id, p.display_name
     from staff_profiles p
     join staff_role_memberships m on m.staff_profile_id = p.id
     where m.role in ('OWNER', 'MANAGER')
       and p.status = 'ACTIVE';

-- Deferred foreign keys from Step 8, now that staff_profiles exists.
alter table feature_flags
  add constraint feature_flags_approved_by_fkey
  foreign key (approved_by) references staff_profiles (id) on delete set null;

alter table menu_versions
  add constraint menu_versions_approved_by_fkey
  foreign key (approved_by) references staff_profiles (id) on delete set null;

alter table translations
  add constraint translations_reviewed_by_fkey
  foreign key (reviewed_by) references staff_profiles (id) on delete set null;

alter table pricing_rules
  add constraint pricing_rules_approved_by_fkey
  foreign key (approved_by) references staff_profiles (id) on delete set null;

alter table promotions
  add constraint promotions_approved_by_fkey
  foreign key (approved_by) references staff_profiles (id) on delete set null;

-- -------------------------------------------------- guest sessions ----------
create table customer_sessions (
  id uuid primary key default gen_random_uuid(),
  -- Only a hash is stored. The browser cookie carries a signed opaque token;
  -- the raw value never lands in the database.
  token_hash text not null unique
    constraint customer_sessions_token_hash_length check (char_length(token_hash) between 32 and 128),
  locale locale_code not null default 'en',
  theme text not null default 'day'
    constraint customer_sessions_theme_allowed check (theme in ('day', 'night')),
  -- Coarse abuse/rate-limit metadata only. No IP address, no user agent, no
  -- PII: this table must stay non-identifying (data-model-v2.md §1).
  request_count integer not null default 0
    constraint customer_sessions_request_count_non_negative check (request_count >= 0),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint customer_sessions_version_positive check (version > 0),
  constraint customer_sessions_expiry_future check (expires_at > created_at)
);

comment on table customer_sessions is
  'Opaque guest sessions. Stores a token hash and non-identifying metadata only; guests are never Supabase Auth users.';

create index customer_sessions_expiry_idx on customer_sessions (expires_at);

create trigger customer_sessions_set_updated
  before update on customer_sessions
  for each row execute function set_row_updated();

-- ---------------------------------------------------------------------- RLS --
alter table staff_profiles enable row level security;
alter table staff_role_memberships enable row level security;
alter table customer_sessions enable row level security;
