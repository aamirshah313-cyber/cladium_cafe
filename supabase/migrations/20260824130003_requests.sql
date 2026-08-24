-- Runbook Step 9 — takeaway, booking, and event requests.
-- data-model-v2.md §4–5.
--
-- Three SEPARATE state machines, enforced here by trigger as well as in the
-- service layer, so that no route, worker, or AI tool can write around them.

create type takeaway_state as enum (
  'DRAFT', 'REQUESTED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'REJECTED', 'CANCELLED'
);

create type booking_state as enum (
  'DRAFT', 'REQUESTED', 'CONFIRMED', 'SEATED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'NO_SHOW'
);

create type event_state as enum (
  'ENQUIRY', 'REQUESTED', 'QUOTED', 'CUSTOMER_ACCEPTED', 'CONFIRMED', 'CANCELLED'
);

create type seating_preference as enum ('GENERAL', 'TREEHOUSE');

-- ------------------------------------------------------ takeaway requests ---
create table takeaway_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references customer_sessions (id) on delete set null,
  -- Minimal PII: a name and a contact number, nothing more.
  guest_name text not null
    constraint takeaway_requests_guest_name_length check (char_length(guest_name) between 2 and 80),
  guest_phone text not null
    constraint takeaway_requests_guest_phone_length check (char_length(guest_phone) between 7 and 20),
  -- What the guest asked for. NOT a promise: staff confirm timing.
  requested_collection_note text
    constraint takeaway_requests_collection_note_length
      check (char_length(requested_collection_note) <= 300),
  notes text constraint takeaway_requests_notes_length check (char_length(notes) <= 500),
  state takeaway_state not null default 'REQUESTED',
  menu_version_id uuid not null references menu_versions (id) on delete restrict,
  subtotal_pkr integer not null
    constraint takeaway_requests_subtotal_non_negative check (subtotal_pkr >= 0),
  -- Signed: a discount is negative. No tax/service charge is applied while
  -- pricing_rules is empty and the rates remain an unresolved owner decision.
  adjustments_pkr integer not null default 0,
  total_pkr integer not null
    constraint takeaway_requests_total_non_negative check (total_pkr >= 0),
  source_channel source_channel not null default 'WEB',
  assigned_staff_id uuid references staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint takeaway_requests_version_positive check (version > 0),
  -- Totals are arithmetic, not opinion.
  constraint takeaway_requests_total_is_sum
    check (total_pkr = subtotal_pkr + adjustments_pkr)
);

comment on table takeaway_requests is
  'Guest takeaway requests. Submission creates REQUESTED; only staff may advance it. Delivery is never offered.';

create index takeaway_requests_state_idx on takeaway_requests (state, created_at desc);
create index takeaway_requests_session_idx on takeaway_requests (session_id);

create trigger takeaway_requests_set_updated
  before update on takeaway_requests
  for each row execute function set_row_updated();

-- Immutable snapshot lines: later menu edits must not rewrite history.
create table takeaway_items (
  id uuid primary key default gen_random_uuid(),
  takeaway_request_id uuid not null references takeaway_requests (id) on delete cascade,
  -- Kept for traceability, but the snapshot fields below are authoritative.
  menu_item_id uuid references menu_items (id) on delete set null,
  menu_variant_id uuid references menu_variants (id) on delete set null,
  item_name text not null
    constraint takeaway_items_name_length check (char_length(item_name) between 1 and 200),
  variant_label text
    constraint takeaway_items_variant_label_length check (char_length(variant_label) <= 60),
  unit_price_pkr integer not null
    constraint takeaway_items_unit_price_non_negative check (unit_price_pkr >= 0),
  quantity integer not null
    constraint takeaway_items_quantity_range check (quantity between 1 and 99),
  line_total_pkr integer not null
    constraint takeaway_items_line_total_non_negative check (line_total_pkr >= 0),
  created_at timestamptz not null default now(),
  constraint takeaway_items_line_total_is_product
    check (line_total_pkr = unit_price_pkr * quantity)
);

comment on table takeaway_items is
  'Immutable price/name snapshots taken at submission. Updates are blocked by trigger.';

create index takeaway_items_request_idx on takeaway_items (takeaway_request_id);

-- ------------------------------------------------------- booking requests ---
create table booking_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references customer_sessions (id) on delete set null,
  guest_name text not null
    constraint booking_requests_guest_name_length check (char_length(guest_name) between 2 and 80),
  guest_phone text not null
    constraint booking_requests_guest_phone_length check (char_length(guest_phone) between 7 and 20),
  -- A requested time is a request, never an availability check.
  requested_at timestamptz not null,
  party_size integer not null
    constraint booking_requests_party_size_range check (party_size between 1 and 200),
  seating_preference seating_preference not null default 'GENERAL',
  notes text constraint booking_requests_notes_length check (char_length(notes) <= 500),
  state booking_state not null default 'REQUESTED',
  source_channel source_channel not null default 'WEB',
  assigned_staff_id uuid references staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint booking_requests_version_positive check (version > 0)
);

comment on table booking_requests is
  'Table and treehouse requests. Treehouse capacity is limited and every booking is staff-confirmed; requested_at is not availability.';

create index booking_requests_state_idx on booking_requests (state, requested_at);

create trigger booking_requests_set_updated
  before update on booking_requests
  for each row execute function set_row_updated();

-- --------------------------------------------------------- event requests ---
create table event_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references customer_sessions (id) on delete set null,
  guest_name text not null
    constraint event_requests_guest_name_length check (char_length(guest_name) between 2 and 80),
  guest_phone text not null
    constraint event_requests_guest_phone_length check (char_length(guest_phone) between 7 and 20),
  event_type text not null
    constraint event_requests_type_length check (char_length(event_type) between 1 and 80),
  requested_at timestamptz not null,
  guest_count integer
    constraint event_requests_guest_count_range check (guest_count is null or guest_count between 1 and 500),
  decor_requested boolean not null default false,
  notes text constraint event_requests_notes_length check (char_length(notes) <= 500),
  state event_state not null default 'ENQUIRY',
  -- Only ever set by staff. The public "décor starts from PKR 8,000" line is
  -- a starting point, not a quote, and must never populate this column.
  quoted_amount_pkr integer
    constraint event_requests_quote_non_negative check (quoted_amount_pkr is null or quoted_amount_pkr >= 0),
  quoted_by uuid references staff_profiles (id) on delete set null,
  quoted_at timestamptz,
  source_channel source_channel not null default 'WEB',
  assigned_staff_id uuid references staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint event_requests_version_positive check (version > 0),
  -- A quote must record who gave it and when.
  constraint event_requests_quote_attribution
    check (quoted_amount_pkr is null or (quoted_by is not null and quoted_at is not null)),
  -- QUOTED and beyond require an actual quote to exist.
  constraint event_requests_quoted_state_requires_amount
    check (state not in ('QUOTED', 'CUSTOMER_ACCEPTED', 'CONFIRMED') or quoted_amount_pkr is not null)
);

comment on table event_requests is
  'Birthday/event enquiries. Décor starts from PKR 8,000, but a quote exists only when staff records one.';

create index event_requests_state_idx on event_requests (state, requested_at);

create trigger event_requests_set_updated
  before update on event_requests
  for each row execute function set_row_updated();

-- ------------------------------------------------- state machine enforcement -
-- Guests may only ever create a request in its initial state; every later
-- move must be an explicitly allowed transition.

create function enforce_takeaway_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.state not in ('DRAFT', 'REQUESTED') then
      raise exception 'A takeaway request must be created as DRAFT or REQUESTED, not %', new.state
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.state = old.state then return new; end if;

  if not (
    (old.state = 'DRAFT' and new.state = 'REQUESTED')
    or (old.state = 'REQUESTED' and new.state in ('ACCEPTED', 'REJECTED', 'CANCELLED'))
    or (old.state = 'ACCEPTED' and new.state in ('PREPARING', 'CANCELLED'))
    or (old.state = 'PREPARING' and new.state in ('READY', 'CANCELLED'))
    or (old.state = 'READY' and new.state = 'COLLECTED')
  ) then
    raise exception 'Illegal takeaway transition % -> %', old.state, new.state
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger takeaway_requests_state_machine
  before insert or update on takeaway_requests
  for each row execute function enforce_takeaway_state();

create function enforce_booking_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.state not in ('DRAFT', 'REQUESTED') then
      raise exception 'A booking request must be created as DRAFT or REQUESTED, not %', new.state
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.state = old.state then return new; end if;

  if not (
    (old.state = 'DRAFT' and new.state = 'REQUESTED')
    or (old.state = 'REQUESTED' and new.state in ('CONFIRMED', 'DECLINED', 'CANCELLED'))
    or (old.state = 'CONFIRMED' and new.state in ('SEATED', 'CANCELLED', 'NO_SHOW'))
    or (old.state = 'SEATED' and new.state = 'COMPLETED')
  ) then
    raise exception 'Illegal booking transition % -> %', old.state, new.state
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger booking_requests_state_machine
  before insert or update on booking_requests
  for each row execute function enforce_booking_state();

create function enforce_event_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.state not in ('ENQUIRY', 'REQUESTED') then
      raise exception 'An event request must be created as ENQUIRY or REQUESTED, not %', new.state
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.state = old.state then return new; end if;

  if not (
    (old.state = 'ENQUIRY' and new.state in ('REQUESTED', 'CANCELLED'))
    or (old.state = 'REQUESTED' and new.state in ('QUOTED', 'CANCELLED'))
    or (old.state = 'QUOTED' and new.state in ('CUSTOMER_ACCEPTED', 'CANCELLED'))
    -- Customer acceptance is not confirmation; only staff may confirm.
    or (old.state = 'CUSTOMER_ACCEPTED' and new.state in ('CONFIRMED', 'CANCELLED'))
  ) then
    raise exception 'Illegal event transition % -> %', old.state, new.state
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger event_requests_state_machine
  before insert or update on event_requests
  for each row execute function enforce_event_state();

-- Submitted line snapshots are immutable.
create function forbid_row_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '% rows are immutable once written', tg_table_name
    using errcode = '23514';
end;
$$;

create trigger takeaway_items_immutable
  before update on takeaway_items
  for each row execute function forbid_row_update();

-- ---------------------------------------------------------------------- RLS --
alter table takeaway_requests enable row level security;
alter table takeaway_items enable row level security;
alter table booking_requests enable row level security;
alter table event_requests enable row level security;
