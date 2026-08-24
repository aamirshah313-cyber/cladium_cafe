-- Runbook Step 9 — carts, confirmation tokens, idempotency keys.
-- data-model-v2.md §3.

-- ---------------------------------------------------------------- carts -----
create table carts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references customer_sessions (id) on delete cascade,
  -- A cart is priced against one published menu version. If the menu is
  -- republished the server recomputes and asks the guest to review again.
  menu_version_id uuid not null references menu_versions (id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint carts_version_positive check (version > 0),
  constraint carts_expiry_future check (expires_at > created_at),
  -- One open cart per session keeps "the draft" unambiguous.
  constraint carts_one_per_session unique (session_id)
);

comment on table carts is
  'Short-lived takeaway drafts. Totals are always recomputed server-side; any client total is a display hint.';

create trigger carts_set_updated
  before update on carts
  for each row execute function set_row_updated();

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts (id) on delete cascade,
  menu_item_id uuid not null references menu_items (id) on delete restrict,
  -- Null for a single-price item; set for a variant-priced one.
  menu_variant_id uuid references menu_variants (id) on delete restrict,
  quantity integer not null
    constraint cart_items_quantity_range check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint cart_items_version_positive check (version > 0),
  -- The same item/variant combination appears once, with a quantity.
  constraint cart_items_unique_line unique (cart_id, menu_item_id, menu_variant_id)
);

comment on table cart_items is
  'Draft lines. Deliberately carries NO price column: prices are read from the published menu at review and submission time.';

create index cart_items_cart_idx on cart_items (cart_id);

create trigger cart_items_set_updated
  before update on cart_items
  for each row execute function set_row_updated();

-- --------------------------------------------------- confirmation tokens ----
create type confirmation_action as enum ('TAKEAWAY_REQUEST', 'BOOKING_REQUEST', 'EVENT_REQUEST');

create table confirmation_tokens (
  id uuid primary key default gen_random_uuid(),
  -- Hash only, never the raw token.
  token_hash text not null unique
    constraint confirmation_tokens_hash_length check (char_length(token_hash) between 32 and 128),
  session_id uuid not null references customer_sessions (id) on delete cascade,
  action confirmation_action not null,
  -- Binds the token to exactly what the guest reviewed. If the draft changes,
  -- the hash no longer matches and the token is refused.
  review_hash text not null
    constraint confirmation_tokens_review_hash_length check (char_length(review_hash) between 32 and 128),
  issued_context jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint confirmation_tokens_version_positive check (version > 0),
  constraint confirmation_tokens_expiry_future check (expires_at > created_at)
);

comment on table confirmation_tokens is
  'Single-use, expiring tokens bound to a session, an action, and the review payload hash. Voice may draft, but submission still requires one of these.';

create index confirmation_tokens_session_idx on confirmation_tokens (session_id, action);
create index confirmation_tokens_expiry_idx on confirmation_tokens (expires_at) where used_at is null;

create trigger confirmation_tokens_set_updated
  before update on confirmation_tokens
  for each row execute function set_row_updated();

-- A spent token is terminal: once used_at is set the row is immutable.
--
-- Deliberately NOT written as "new.used_at is distinct from old.used_at":
-- now() returns the transaction timestamp, so two uses inside one transaction
-- produce an identical value and such a check would silently pass.
create function forbid_token_reuse()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.used_at is not null then
    raise exception 'Confirmation token % has already been used', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger confirmation_tokens_single_use
  before update on confirmation_tokens
  for each row execute function forbid_token_reuse();

-- ------------------------------------------------------ idempotency keys ----
create type idempotency_status as enum ('IN_PROGRESS', 'SUCCEEDED', 'FAILED');

create table idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references customer_sessions (id) on delete cascade,
  -- Vapi tool calls arrive with their own id and map onto this same layer.
  actor_key text not null
    constraint idempotency_keys_actor_length check (char_length(actor_key) between 1 and 200),
  operation text not null
    constraint idempotency_keys_operation_format check (operation ~ '^[a-z][a-z0-9_.]*$'),
  idempotency_key text not null
    constraint idempotency_keys_key_length check (char_length(idempotency_key) between 16 and 128),
  -- Replaying a key with a different payload is a conflict, not a retry.
  request_fingerprint text not null
    constraint idempotency_keys_fingerprint_length check (char_length(request_fingerprint) between 32 and 128),
  status idempotency_status not null default 'IN_PROGRESS',
  result_entity_type text,
  result_entity_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
    constraint idempotency_keys_version_positive check (version > 0),
  constraint idempotency_keys_scope_unique unique (actor_key, operation, idempotency_key),
  constraint idempotency_keys_expiry_future check (expires_at > created_at),
  -- A succeeded operation must say what it produced.
  constraint idempotency_keys_success_has_result
    check (status <> 'SUCCEEDED' or (result_entity_type is not null and result_entity_id is not null))
);

create index idempotency_keys_expiry_idx on idempotency_keys (expires_at);

create trigger idempotency_keys_set_updated
  before update on idempotency_keys
  for each row execute function set_row_updated();

-- ---------------------------------------------------------------------- RLS --
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table confirmation_tokens enable row level security;
alter table idempotency_keys enable row level security;
