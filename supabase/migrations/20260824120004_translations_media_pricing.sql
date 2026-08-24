-- Runbook Step 8 — translations, media assets, pricing rules, promotions.
-- data-model-v2.md §2.
--
-- pricing_rules and promotions are intentionally EMPTY. An empty pricing_rules
-- table is the correct state while tax/service-charge rates remain an
-- unresolved owner decision: the product then cannot calculate or promise
-- them. An empty promotions table is correct until the owner supplies
-- approved campaigns.

-- --------------------------------------------------------- translations ----
create table translations (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    constraint translations_entity_type_allowed
      check (entity_type in (
        'MENU_CATEGORY', 'MENU_ITEM', 'MENU_VARIANT',
        'BUSINESS_SETTING', 'MEDIA_ASSET', 'PROMOTION'
      )),
  -- Polymorphic by design: no FK, because the target table varies.
  entity_id uuid not null,
  field text not null
    constraint translations_field_format check (field ~ '^[a-z][a-z0-9_]*$'),
  locale locale_code not null,
  value text not null
    constraint translations_value_length check (char_length(value) between 1 and 4000),
  reviewed_by uuid,
  reviewed_at timestamptz,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint translations_version_positive check (version > 0),
  constraint translations_unique_field
    unique (entity_type, entity_id, field, locale),
  -- The core guardrail: a translation cannot be marked approved without a
  -- recorded human reviewer. Machine-generated Urdu can therefore never be
  -- published for authoritative menu, policy, or legal text.
  constraint translations_approved_requires_reviewer
    check (not is_approved or (reviewed_by is not null and reviewed_at is not null))
);

comment on table translations is
  'Owner/fluent-speaker reviewed locale text. Unapproved rows are never served; the canonical English falls back instead.';

create index translations_lookup_idx on translations (entity_type, entity_id, locale);
create index translations_approved_idx
  on translations (entity_type, entity_id, locale)
  where is_approved;

create trigger translations_set_updated
  before update on translations
  for each row execute function set_row_updated();

-- ---------------------------------------------------------- media assets ---
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique
    constraint media_assets_storage_path_length check (char_length(storage_path) between 1 and 500),
  media_type text not null
    constraint media_assets_type_allowed check (media_type in ('IMAGE', 'VIDEO', 'LOGO')),
  mime_type text not null
    constraint media_assets_mime_format check (mime_type ~ '^[a-z]+/[a-z0-9.+-]+$'),
  width_px integer constraint media_assets_width_positive check (width_px is null or width_px > 0),
  height_px integer constraint media_assets_height_positive check (height_px is null or height_px > 0),
  bytes integer constraint media_assets_bytes_positive check (bytes is null or bytes > 0),
  checksum text not null,
  -- Focal point as a 0..1 fraction, for art-directed cropping.
  focal_x numeric(4, 3) constraint media_assets_focal_x_range check (focal_x is null or (focal_x >= 0 and focal_x <= 1)),
  focal_y numeric(4, 3) constraint media_assets_focal_y_range check (focal_y is null or (focal_y >= 0 and focal_y <= 1)),
  rights_holder text not null
    constraint media_assets_rights_holder_length check (char_length(rights_holder) between 1 and 200),
  rights_note text constraint media_assets_rights_note_length check (char_length(rights_note) <= 1000),
  license text constraint media_assets_license_length check (char_length(license) <= 200),
  is_owner_approved boolean not null default false,
  publish_state publish_state not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint media_assets_version_positive check (version > 0),
  -- Nothing reaches the public site without recorded owner approval. This is
  -- the schema-level half of release gate 0/1 on imagery rights.
  constraint media_assets_publish_requires_approval
    check (publish_state <> 'PUBLISHED' or is_owner_approved)
);

comment on table media_assets is
  'Owner-approved media only. Alt text per locale lives in translations (entity_type = MEDIA_ASSET, field = alt_text).';

create index media_assets_published_idx on media_assets (media_type) where publish_state = 'PUBLISHED';

create trigger media_assets_set_updated
  before update on media_assets
  for each row execute function set_row_updated();

-- --------------------------------------------------------- pricing rules ---
create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null
    constraint pricing_rules_type_allowed
      check (rule_type in ('TAX', 'SERVICE_CHARGE', 'DISCOUNT')),
  name text not null
    constraint pricing_rules_name_length check (char_length(name) between 1 and 120),
  -- Rates are basis points (1/100th of a percent) so no float ever enters a
  -- money calculation. 10000 bp = 100%.
  rate_basis_points integer
    constraint pricing_rules_rate_range
      check (rate_basis_points is null or (rate_basis_points >= 0 and rate_basis_points <= 10000)),
  fixed_amount_pkr integer
    constraint pricing_rules_fixed_amount_non_negative
      check (fixed_amount_pkr is null or fixed_amount_pkr >= 0),
  applies_to text not null default 'ORDER_TOTAL'
    constraint pricing_rules_applies_to_allowed
      check (applies_to in ('ORDER_TOTAL', 'ITEM', 'CATEGORY')),
  effective_from timestamptz not null,
  effective_to timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint pricing_rules_version_positive check (version > 0),
  constraint pricing_rules_effective_window
    check (effective_to is null or effective_to > effective_from),
  -- A rule must actually specify a charge.
  constraint pricing_rules_has_amount
    check (rate_basis_points is not null or fixed_amount_pkr is not null),
  -- An active money rule must be owner-approved.
  constraint pricing_rules_active_requires_approval
    check (not is_active or (approved_by is not null and approved_at is not null))
);

comment on table pricing_rules is
  'Owner-approved tax/service/discount rules. EMPTY IS VALID and is the current correct state: with no approved rate, the product must not calculate or promise tax or service charges.';

create index pricing_rules_active_idx on pricing_rules (rule_type, effective_from) where is_active;

create trigger pricing_rules_set_updated
  before update on pricing_rules
  for each row execute function set_row_updated();

-- ------------------------------------------------------------ promotions ---
create table promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique
    constraint promotions_code_format check (code is null or code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  name text not null
    constraint promotions_name_length check (char_length(name) between 1 and 120),
  description text constraint promotions_description_length check (char_length(description) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- Deterministic, machine-evaluated conditions only.
  conditions jsonb not null default '{}'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  publish_state publish_state not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 constraint promotions_version_positive check (version > 0),
  constraint promotions_window check (ends_at is null or ends_at > starts_at),
  -- No promotion is ever published without recorded owner approval.
  constraint promotions_publish_requires_approval
    check (publish_state <> 'PUBLISHED' or (approved_by is not null and approved_at is not null))
);

comment on table promotions is
  'Approved campaigns only. EMPTY IS VALID and is the current correct state; never invent a promotion.';

create index promotions_live_idx on promotions (starts_at) where publish_state = 'PUBLISHED';

create trigger promotions_set_updated
  before update on promotions
  for each row execute function set_row_updated();

-- ---------------------------------------------------------------------- RLS --
alter table translations enable row level security;
alter table media_assets enable row level security;
alter table pricing_rules enable row level security;
alter table promotions enable row level security;
