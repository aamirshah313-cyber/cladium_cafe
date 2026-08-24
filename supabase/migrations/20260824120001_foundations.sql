-- Runbook Step 8 — foundations: enums and shared trigger helpers.
-- Source of truth: cladium-research/architecture/data-model-v2.md §1–2.
--
-- Conventions enforced from here on:
--   * timestamps are timestamptz in UTC
--   * money is integer PKR, never a float
--   * user-facing rows carry created_at, updated_at and an integer version
--   * RLS is enabled on every table; policies arrive in Step 10

-- Tri-state availability. The importer defaults missing source availability to
-- UNKNOWN and must never silently convert it to AVAILABLE or UNAVAILABLE.
create type availability_status as enum ('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN');

create type publish_state as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');

create type menu_review_status as enum ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- Launch locales. Urdu renders RTL.
create type locale_code as enum ('en', 'ur');

-- Maintains updated_at and bumps the optimistic-concurrency version.
-- search_path is pinned empty so the function cannot be hijacked by a
-- caller-controlled schema.
create function set_row_updated()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

comment on function set_row_updated() is
  'Trigger helper: maintains updated_at and the integer version used for optimistic concurrency (data-model-v2.md §1).';
