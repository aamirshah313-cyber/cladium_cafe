-- Runbook Step 8 — versioned menu content.
-- data-model-v2.md §2.
--
-- The JSON in cladium-research/data/menu.json is source evidence. It is
-- imported (Step 11) into an UNPUBLISHED version; publishing requires owner
-- sign-off. Nothing here inserts menu data.

-- -------------------------------------------------------------- versions ---
create table menu_versions (
  id uuid primary key default gen_random_uuid(),
  version_number integer not null unique
    constraint menu_versions_number_positive check (version_number > 0),
  -- Checksum of the imported source, so a repeated identical import is
  -- detectable and idempotent (Step 11).
  source_checksum text not null unique
    constraint menu_versions_checksum_length check (char_length(source_checksum) between 16 and 128),
  -- The source page assets this version was transcribed from.
  source_references jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now(),
  review_status menu_review_status not null default 'DRAFT',
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  notes text constraint menu_versions_notes_length check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint menu_versions_version_positive check (version > 0),
  -- Publication requires an explicit approval record: no auto-publish.
  constraint menu_versions_publish_requires_approval
    check (
      published_at is null
      or (review_status = 'APPROVED' and approved_by is not null and approved_at is not null)
    )
);

comment on table menu_versions is
  'Immutable-by-convention menu snapshots. The public site reads only the single published version.';

-- At most one published menu version at any time.
create unique index menu_versions_single_published
  on menu_versions ((true))
  where published_at is not null;

create trigger menu_versions_set_updated
  before update on menu_versions
  for each row execute function set_row_updated();

-- ------------------------------------------------------------ categories ---
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  menu_version_id uuid not null references menu_versions (id) on delete cascade,
  stable_id text not null
    constraint menu_categories_stable_id_format check (stable_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  name text not null
    constraint menu_categories_name_length check (char_length(name) between 1 and 120),
  sort_order integer not null default 0,
  publish_state publish_state not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint menu_categories_version_positive check (version > 0),
  constraint menu_categories_stable_id_unique unique (menu_version_id, stable_id),
  -- Composite target so children cannot straddle two menu versions.
  constraint menu_categories_version_scoped_id unique (menu_version_id, id)
);

create index menu_categories_version_sort_idx
  on menu_categories (menu_version_id, sort_order);

create trigger menu_categories_set_updated
  before update on menu_categories
  for each row execute function set_row_updated();

-- ----------------------------------------------------------------- items ---
create table menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_version_id uuid not null references menu_versions (id) on delete cascade,
  category_id uuid not null,
  stable_id text not null
    constraint menu_items_stable_id_format check (stable_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  name text not null
    constraint menu_items_name_length check (char_length(name) between 1 and 200),
  description text
    constraint menu_items_description_length check (char_length(description) <= 1000),
  -- Some source categories nest items under a labelled group (e.g. Steaks →
  -- "Chicken"/"Beef"). Preserved rather than flattened.
  group_label text
    constraint menu_items_group_label_length check (char_length(group_label) <= 120),
  -- Single-price items carry a price here; variant-priced items leave it null
  -- and carry prices on menu_variants. The importer enforces exactly one of
  -- the two (Step 11); the column constraint guarantees validity either way.
  base_price_pkr integer
    constraint menu_items_base_price_non_negative check (base_price_pkr is null or base_price_pkr >= 0),
  availability availability_status not null default 'UNKNOWN',
  publish_state publish_state not null default 'DRAFT',
  is_signature boolean not null default false,
  -- Only populated when a claim has actually been verified with the café.
  dietary_claims text[] not null default '{}'::text[],
  serves text constraint menu_items_serves_length check (char_length(serves) <= 60),
  quantity_label text constraint menu_items_quantity_length check (char_length(quantity_label) <= 60),
  served_with text constraint menu_items_served_with_length check (char_length(served_with) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint menu_items_version_positive check (version > 0),
  constraint menu_items_stable_id_unique unique (menu_version_id, stable_id),
  constraint menu_items_version_scoped_id unique (menu_version_id, id),
  constraint menu_items_category_same_version
    foreign key (menu_version_id, category_id)
    references menu_categories (menu_version_id, id)
    on delete cascade
);

comment on column menu_items.availability is
  'Tri-state. UNKNOWN must never be presented to a guest as available or unavailable.';

create index menu_items_category_sort_idx on menu_items (category_id, sort_order);
create index menu_items_published_idx
  on menu_items (menu_version_id)
  where publish_state = 'PUBLISHED';

create trigger menu_items_set_updated
  before update on menu_items
  for each row execute function set_row_updated();

-- -------------------------------------------------------------- variants ---
create table menu_variants (
  id uuid primary key default gen_random_uuid(),
  menu_version_id uuid not null references menu_versions (id) on delete cascade,
  item_id uuid not null,
  stable_id text not null
    constraint menu_variants_stable_id_format check (stable_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  -- e.g. "half", "full"
  label text not null
    constraint menu_variants_label_length check (char_length(label) between 1 and 60),
  price_pkr integer not null
    constraint menu_variants_price_non_negative check (price_pkr >= 0),
  sort_order integer not null default 0,
  publish_state publish_state not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint menu_variants_version_positive check (version > 0),
  constraint menu_variants_stable_id_unique unique (menu_version_id, stable_id),
  constraint menu_variants_label_unique unique (item_id, label),
  constraint menu_variants_item_same_version
    foreign key (menu_version_id, item_id)
    references menu_items (menu_version_id, id)
    on delete cascade
);

create index menu_variants_item_sort_idx on menu_variants (item_id, sort_order);

create trigger menu_variants_set_updated
  before update on menu_variants
  for each row execute function set_row_updated();

-- ---------------------------------------------------------------------- RLS --
alter table menu_versions enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table menu_variants enable row level security;
