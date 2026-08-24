-- Runbook Step 10 — table privileges.
--
-- RLS decides WHICH ROWS a role may touch; GRANT decides whether the role may
-- touch the table at all. Both are required, and they are deliberately
-- separate layers: a missing policy denies rows, a missing grant denies the
-- table outright.
--
-- Least privilege applies. Two tables get NO client grants whatsoever —
-- confirmation_tokens and idempotency_keys are service-side machinery, so
-- they are unreachable by anon/authenticated even if a policy were added by
-- mistake later.

grant usage on schema public to anon, authenticated;

-- ------------------------------------------------- public-readable content --
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

-- --------------------------------------------------- guest-scoped records ---
grant select on
  customer_sessions,
  takeaway_requests,
  takeaway_items,
  booking_requests,
  event_requests,
  consent_events
to anon, authenticated;

-- A guest builds and edits their own draft.
grant select, insert, update, delete on carts, cart_items to anon, authenticated;

-- ------------------------------------------------------------ staff reads ---
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

-- ----------------------------------------------------------- staff writes ---
-- Row-level policies narrow these to owner/manager (content, flags, staff
-- administration) and to the relevant queue role (requests).
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

-- --------------------------------------------------------- service worker ---
-- The dispatcher, importer, and request-submission paths run as service_role,
-- which bypasses RLS. Server-side authorization still applies on top.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- confirmation_tokens and idempotency_keys are intentionally absent from
-- every grant above: service_role only.
