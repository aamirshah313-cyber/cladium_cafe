-- Runbook Step 10 — row level security policies.
--
-- Roles: OWNER, MANAGER, ORDER_STAFF, BOOKING_STAFF, AUDITOR.
--   OWNER/MANAGER  — full operational access, plus publishing and flags.
--   ORDER_STAFF    — takeaway queue only.
--   BOOKING_STAFF  — bookings and events only.
--   AUDITOR        — read-only; never writes anything.
--
-- Guests read only their own session's rows. Anonymous visitors read only
-- published, non-sensitive content. Everything not granted here stays denied,
-- because RLS is enabled with no permissive fallback.
--
-- service_role bypasses RLS entirely; the server still applies its own
-- authorization on top. The allow/deny matrix in scripts/db/rls-tests.sql
-- exercises every one of these paths.

-- ==================================================== business configuration =
create policy business_settings_public_read on business_settings
  for select to anon, authenticated
  using (not is_sensitive);

create policy business_settings_staff_read on business_settings
  for select to authenticated
  using (is_staff());

create policy business_settings_manage on business_settings
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

create policy business_hours_public_read on business_hours
  for select to anon, authenticated
  using (publish_state = 'PUBLISHED');

create policy business_hours_staff_read on business_hours
  for select to authenticated
  using (is_staff());

create policy business_hours_manage on business_hours
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

create policy business_hour_exceptions_public_read on business_hour_exceptions
  for select to anon, authenticated
  using (publish_state = 'PUBLISHED');

create policy business_hour_exceptions_manage on business_hour_exceptions
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

-- Flags are server-authoritative: no public read at all.
create policy feature_flags_staff_read on feature_flags
  for select to authenticated
  using (is_staff());

create policy feature_flags_manage on feature_flags
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

-- ================================================================ menu content
create policy menu_versions_public_read on menu_versions
  for select to anon, authenticated
  using (published_at is not null);

create policy menu_versions_staff_read on menu_versions
  for select to authenticated
  using (is_staff());

-- Only owner/manager may import, approve, or publish a menu version.
create policy menu_versions_manage on menu_versions
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

create policy menu_categories_public_read on menu_categories
  for select to anon, authenticated
  using (publish_state = 'PUBLISHED' and is_published_menu_version(menu_version_id));

create policy menu_categories_staff_read on menu_categories
  for select to authenticated
  using (is_staff());

create policy menu_categories_manage on menu_categories
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

create policy menu_items_public_read on menu_items
  for select to anon, authenticated
  using (publish_state = 'PUBLISHED' and is_published_menu_version(menu_version_id));

create policy menu_items_staff_read on menu_items
  for select to authenticated
  using (is_staff());

create policy menu_items_manage on menu_items
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

create policy menu_variants_public_read on menu_variants
  for select to anon, authenticated
  using (publish_state = 'PUBLISHED' and is_published_menu_version(menu_version_id));

create policy menu_variants_staff_read on menu_variants
  for select to authenticated
  using (is_staff());

create policy menu_variants_manage on menu_variants
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

-- Only reviewed translations are ever readable by the public.
create policy translations_public_read on translations
  for select to anon, authenticated
  using (is_approved);

create policy translations_staff_read on translations
  for select to authenticated
  using (is_staff());

create policy translations_manage on translations
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

create policy media_assets_public_read on media_assets
  for select to anon, authenticated
  using (publish_state = 'PUBLISHED' and is_owner_approved);

create policy media_assets_staff_read on media_assets
  for select to authenticated
  using (is_staff());

create policy media_assets_manage on media_assets
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

-- Pricing rules are internal: staff read, owner/manager write, no public read.
create policy pricing_rules_staff_read on pricing_rules
  for select to authenticated
  using (is_staff());

create policy pricing_rules_manage on pricing_rules
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

create policy promotions_public_read on promotions
  for select to anon, authenticated
  using (publish_state = 'PUBLISHED');

create policy promotions_staff_read on promotions
  for select to authenticated
  using (is_staff());

create policy promotions_manage on promotions
  for all to authenticated
  using (is_owner_or_manager())
  with check (is_owner_or_manager());

-- ======================================================== staff and sessions =
create policy staff_profiles_self_read on staff_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy staff_profiles_privileged_read on staff_profiles
  for select to authenticated
  using (is_owner_or_manager() or staff_has_role(array['AUDITOR']::staff_role[]));

-- Only an owner may create, suspend, or remove staff.
create policy staff_profiles_manage on staff_profiles
  for all to authenticated
  using (staff_has_role(array['OWNER']::staff_role[]))
  with check (staff_has_role(array['OWNER']::staff_role[]));

create policy staff_role_memberships_read on staff_role_memberships
  for select to authenticated
  using (
    is_owner_or_manager()
    or staff_has_role(array['AUDITOR']::staff_role[])
    or staff_profile_id = current_staff_id()
  );

-- Role grants are an owner-only action.
create policy staff_role_memberships_manage on staff_role_memberships
  for all to authenticated
  using (staff_has_role(array['OWNER']::staff_role[]))
  with check (staff_has_role(array['OWNER']::staff_role[]));

-- A guest may read only their own session row; nobody else can.
create policy customer_sessions_self_read on customer_sessions
  for select to anon, authenticated
  using (id = current_customer_session_id());

create policy customer_sessions_staff_read on customer_sessions
  for select to authenticated
  using (is_owner_or_manager() or staff_has_role(array['AUDITOR']::staff_role[]));

-- ============================================================ drafts / tokens =
create policy carts_guest_all on carts
  for all to anon, authenticated
  using (session_id = current_customer_session_id())
  with check (session_id = current_customer_session_id());

create policy cart_items_guest_all on cart_items
  for all to anon, authenticated
  using (exists (select 1 from carts c where c.id = cart_id and c.session_id = current_customer_session_id()))
  with check (exists (select 1 from carts c where c.id = cart_id and c.session_id = current_customer_session_id()));

-- Confirmation tokens and idempotency keys are service-side only. No policy
-- is granted to anon/authenticated, so both remain fully denied to clients
-- and are reachable only via service_role.

-- ================================================================== requests =
create policy takeaway_requests_guest_read on takeaway_requests
  for select to anon, authenticated
  using (session_id = current_customer_session_id());

create policy takeaway_requests_staff_read on takeaway_requests
  for select to authenticated
  using (is_staff());

-- Takeaway queue: order staff plus owner/manager. Auditors are excluded from
-- writes by omission.
create policy takeaway_requests_staff_update on takeaway_requests
  for update to authenticated
  using (staff_has_role(array['OWNER', 'MANAGER', 'ORDER_STAFF']::staff_role[]))
  with check (staff_has_role(array['OWNER', 'MANAGER', 'ORDER_STAFF']::staff_role[]));

create policy takeaway_items_guest_read on takeaway_items
  for select to anon, authenticated
  using (exists (
    select 1 from takeaway_requests r
    where r.id = takeaway_request_id and r.session_id = current_customer_session_id()
  ));

create policy takeaway_items_staff_read on takeaway_items
  for select to authenticated
  using (is_staff());

create policy booking_requests_guest_read on booking_requests
  for select to anon, authenticated
  using (session_id = current_customer_session_id());

create policy booking_requests_staff_read on booking_requests
  for select to authenticated
  using (is_staff());

create policy booking_requests_staff_update on booking_requests
  for update to authenticated
  using (staff_has_role(array['OWNER', 'MANAGER', 'BOOKING_STAFF']::staff_role[]))
  with check (staff_has_role(array['OWNER', 'MANAGER', 'BOOKING_STAFF']::staff_role[]));

create policy event_requests_guest_read on event_requests
  for select to anon, authenticated
  using (session_id = current_customer_session_id());

create policy event_requests_staff_read on event_requests
  for select to authenticated
  using (is_staff());

create policy event_requests_staff_update on event_requests
  for update to authenticated
  using (staff_has_role(array['OWNER', 'MANAGER', 'BOOKING_STAFF']::staff_role[]))
  with check (staff_has_role(array['OWNER', 'MANAGER', 'BOOKING_STAFF']::staff_role[]));

-- ================================================================== history ==
-- Read-only to staff; append is a service-side action inside the same
-- transaction as the business change.
create policy status_events_staff_read on status_events
  for select to authenticated
  using (is_staff());

create policy audit_events_privileged_read on audit_events
  for select to authenticated
  using (is_owner_or_manager() or staff_has_role(array['AUDITOR']::staff_role[]));

create policy consent_events_staff_read on consent_events
  for select to authenticated
  using (is_owner_or_manager() or staff_has_role(array['AUDITOR']::staff_role[]));

create policy consent_events_guest_read on consent_events
  for select to anon, authenticated
  using (session_id = current_customer_session_id());

-- Outbox and webhook tables are worker-owned infrastructure. Owner/manager
-- and auditors may look at delivery health; nobody but the service writes.
create policy outbox_events_privileged_read on outbox_events
  for select to authenticated
  using (is_owner_or_manager() or staff_has_role(array['AUDITOR']::staff_role[]));

create policy webhook_events_privileged_read on webhook_events
  for select to authenticated
  using (is_owner_or_manager() or staff_has_role(array['AUDITOR']::staff_role[]));
