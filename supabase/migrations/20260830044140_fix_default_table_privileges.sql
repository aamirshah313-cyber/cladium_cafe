-- Runbook Step 42 — fix over-broad default table privileges.
--
-- Found live via the backup/restore drill's RLS re-verification — the
-- first time `npm run db:test:rls` has actually run against a live
-- Postgres since Step 10 itself (Docker was unavailable in this sandbox
-- for every step from Step 11 through Step 41, D-017). A fresh
-- `supabase db reset`, with no restore involved at all, reproduces the
-- same failure — this is a real, current gap in the migration set as it
-- stands today, not an artifact of the drill.
--
-- Root cause, confirmed against Supabase's own current documentation (a
-- live WebSearch, not a guess — supabase.com/blog/postgres-roles-and-
-- privileges): by platform default, every table created in the `public`
-- schema automatically receives SELECT/INSERT/UPDATE/DELETE grants for
-- `anon`, `authenticated`, and `service_role`. `20260824140003_grants.sql`
-- (Step 10) was written under a least-privilege, explicit-grant-only
-- model and never revoked this platform default — so *every* table,
-- including `confirmation_tokens` and `idempotency_keys`, whose own doc
-- comment there claims they "get NO client grants whatsoever," actually
-- carries full `anon`/`authenticated` CRUD access at the grant layer.
-- RLS policies still correctly deny row-level access on most of these
-- tables (confirmed live: `anon` querying `feature_flags` returns `0`
-- rows, not the rows themselves) — but this is fragile, accidental
-- defense-in-depth, not the deliberate two-layer grant+RLS model
-- `grants.sql`'s own comment describes and this project has claimed
-- since Step 10.
--
-- Fixed two ways, matching Supabase's own documented remediation exactly:
--
-- 1. `ALTER DEFAULT PRIVILEGES` so every table created by a *future*
--    migration defaults to no access — closing this gap permanently,
--    not just for the 28 tables that exist today.
-- 2. Explicit `REVOKE ALL ... FROM anon, authenticated` on every existing
--    table (views included — `public_business_settings`/
--    `staff_requiring_mfa` showed the same over-grant live), then
--    `grants.sql`'s own GRANT statements re-applied verbatim — restoring
--    the exact originally-intended state rather than attempting to
--    compute a diff. `service_role` is untouched throughout: its
--    "bypasses RLS, full access by design" grant from `grants.sql` was
--    always correct and is not part of this bug.

-- ---- 1. Stop the platform default for every future table/function ----
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- ---- 2a. Strip the over-broad grant already applied to every existing table/view ----
revoke all on all tables in schema public from anon, authenticated;

-- ---- 2b. Re-apply the exact intended grants, verbatim from grants.sql ----
grant usage on schema public to anon, authenticated;

grant select on
  business_settings,
  business_hours,
  business_hour_exceptions,
  menu_versions,
  menu_categories,
  menu_items,
  menu_variants,
  translations,
  media_assets,
  promotions
to anon, authenticated;

grant select on public_business_settings to anon, authenticated;

grant select on
  customer_sessions,
  takeaway_requests,
  takeaway_items,
  booking_requests,
  event_requests,
  consent_events
to anon, authenticated;

grant select, insert, update, delete on carts, cart_items to anon, authenticated;

grant select on
  feature_flags,
  pricing_rules,
  staff_profiles,
  staff_role_memberships,
  status_events,
  audit_events,
  outbox_events,
  webhook_events
to authenticated;

grant select on staff_requiring_mfa to authenticated;

grant insert, update, delete on
  business_settings,
  business_hours,
  business_hour_exceptions,
  feature_flags,
  menu_versions,
  menu_categories,
  menu_items,
  menu_variants,
  translations,
  media_assets,
  pricing_rules,
  promotions,
  staff_profiles,
  staff_role_memberships
to authenticated;

grant update on takeaway_requests, booking_requests, event_requests to authenticated;

-- confirmation_tokens and idempotency_keys remain absent from every grant
-- above — now actually true at the grant layer, not just intended.
