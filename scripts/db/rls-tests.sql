-- Runbook Step 10 — RLS allow/deny matrix.
--
-- Exercises every identity that can reach the database:
--   anon, guest A, guest B, OWNER, MANAGER, ORDER_STAFF, BOOKING_STAFF,
--   AUDITOR, and the service worker (service_role, which bypasses RLS).
--
-- Everything runs in a transaction that is rolled back.
-- Run with: npm run db:test:rls   (requires the local stack)

\set ON_ERROR_STOP on

begin;

-- ------------------------------------------------------------------ fixtures
\set pub_version '''aaaaaaaa-0000-4000-8000-000000000001'''
\set draft_version '''aaaaaaaa-0000-4000-8000-000000000002'''
\set pub_category '''bbbbbbbb-0000-4000-8000-000000000001'''
\set pub_item '''cccccccc-0000-4000-8000-000000000001'''
\set draft_item '''cccccccc-0000-4000-8000-000000000002'''
\set session_a '''dddddddd-0000-4000-8000-00000000000a'''
\set session_b '''dddddddd-0000-4000-8000-00000000000b'''
\set request_a '''eeeeeeee-0000-4000-8000-00000000000a'''
\set request_b '''eeeeeeee-0000-4000-8000-00000000000b'''

-- Staff auth users, one per role.
\set u_owner '''f0000000-0000-4000-8000-000000000001'''
\set u_manager '''f0000000-0000-4000-8000-000000000002'''
\set u_order '''f0000000-0000-4000-8000-000000000003'''
\set u_booking '''f0000000-0000-4000-8000-000000000004'''
\set u_auditor '''f0000000-0000-4000-8000-000000000005'''

insert into auth.users (id, instance_id, aud, role, email) values
  (:u_owner::uuid,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.invalid'),
  (:u_manager::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@example.invalid'),
  (:u_order::uuid,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'order@example.invalid'),
  (:u_booking::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'booking@example.invalid'),
  (:u_auditor::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auditor@example.invalid');

insert into staff_profiles (id, user_id, display_name) values
  ('a1000000-0000-4000-8000-000000000001', :u_owner::uuid,   'Owner'),
  ('a1000000-0000-4000-8000-000000000002', :u_manager::uuid, 'Manager'),
  ('a1000000-0000-4000-8000-000000000003', :u_order::uuid,   'Order Staff'),
  ('a1000000-0000-4000-8000-000000000004', :u_booking::uuid, 'Booking Staff'),
  ('a1000000-0000-4000-8000-000000000005', :u_auditor::uuid, 'Auditor');

insert into staff_role_memberships (staff_profile_id, role) values
  ('a1000000-0000-4000-8000-000000000001', 'OWNER'),
  ('a1000000-0000-4000-8000-000000000002', 'MANAGER'),
  ('a1000000-0000-4000-8000-000000000003', 'ORDER_STAFF'),
  ('a1000000-0000-4000-8000-000000000004', 'BOOKING_STAFF'),
  ('a1000000-0000-4000-8000-000000000005', 'AUDITOR');

-- One published menu version and one unpublished draft.
insert into menu_versions (id, version_number, source_checksum, review_status, approved_by, approved_at, published_at)
values (:pub_version::uuid, 101, 'checksum-published-aaaa', 'APPROVED',
        'a1000000-0000-4000-8000-000000000001', now(), now());

insert into menu_versions (id, version_number, source_checksum)
values (:draft_version::uuid, 102, 'checksum-draft-bbbbbbb');

insert into menu_categories (id, menu_version_id, stable_id, name, publish_state)
values (:pub_category::uuid, :pub_version::uuid, 'sandwiches', 'Sandwiches', 'PUBLISHED');

insert into menu_items (id, menu_version_id, category_id, stable_id, name, base_price_pkr, publish_state)
values (:pub_item::uuid, :pub_version::uuid, :pub_category::uuid, 'published-item', 'Published Item', 1399, 'PUBLISHED');

insert into menu_items (id, menu_version_id, category_id, stable_id, name, base_price_pkr, publish_state)
values (:draft_item::uuid, :pub_version::uuid, :pub_category::uuid, 'draft-item', 'Draft Item', 999, 'DRAFT');

-- Two independent guests, each with a takeaway request.
insert into customer_sessions (id, token_hash, expires_at) values
  (:session_a::uuid, repeat('1', 64), now() + interval '1 day'),
  (:session_b::uuid, repeat('2', 64), now() + interval '1 day');

insert into takeaway_requests (id, session_id, guest_name, guest_phone, menu_version_id, subtotal_pkr, total_pkr) values
  (:request_a::uuid, :session_a::uuid, 'Guest A', '+92 300 0000001', :pub_version::uuid, 1399, 1399),
  (:request_b::uuid, :session_b::uuid, 'Guest B', '+92 300 0000002', :pub_version::uuid, 999, 999);

insert into booking_requests (session_id, guest_name, guest_phone, requested_at, party_size)
values (:session_a::uuid, 'Guest A', '+92 300 0000001', now() + interval '2 days', 4);

insert into feature_flags (environment, name, is_enabled) values ('production', 'PUBLIC_SITE', false);
insert into pricing_rules (rule_type, name, rate_basis_points, effective_from)
values ('TAX', 'Draft tax rule', 1600, now());

-- ------------------------------------------------------------------ helpers
create or replace function pg_temp.expect_count(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual <> expected then
    raise exception 'RLS MATRIX FAIL — %: expected % row(s), got %', label, expected, actual;
  end if;
end $$;

-- For tables with no GRANT at all to the current role (confirmation_tokens,
-- idempotency_keys, and staff-only tables read from a non-authenticated
-- role), Postgres denies the whole statement rather than filtering rows via
-- RLS. Both are "no access"; this asserts the table-privilege form of it.
create or replace function pg_temp.expect_no_access(label text, query text)
returns void language plpgsql as $$
declare
  result bigint;
begin
  execute query into result;
  raise exception 'RLS MATRIX FAIL — %: expected permission denied, got % row(s)', label, result;
exception
  when insufficient_privilege then
    return;
end $$;

create or replace function pg_temp.become_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('app.customer_session_id', null, true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.become_guest(session uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('app.customer_session_id', session::text, true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.become_staff(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id)::text, true);
  perform set_config('app.customer_session_id', null, true);
  execute 'set local role authenticated';
end $$;

-- ============================================================ anonymous =====
select pg_temp.become_anon();

select pg_temp.expect_count('anon sees only the published menu version',
  (select count(*) from menu_versions), 1);

select pg_temp.expect_count('anon sees only published items',
  (select count(*) from menu_items), 1);

select pg_temp.expect_no_access('anon cannot read feature flags',
  'select count(*) from feature_flags');

select pg_temp.expect_no_access('anon cannot read pricing rules',
  'select count(*) from pricing_rules');

select pg_temp.expect_count('anon cannot read any guest request',
  (select count(*) from takeaway_requests), 0);

select pg_temp.expect_count('anon cannot read sessions',
  (select count(*) from customer_sessions), 0);

select pg_temp.expect_no_access('anon cannot read confirmation tokens',
  'select count(*) from confirmation_tokens');

select pg_temp.expect_no_access('anon cannot read audit events',
  'select count(*) from audit_events');

reset role;

-- ============================================================ guest A =======
select pg_temp.become_guest(:session_a::uuid);

select pg_temp.expect_count('guest A sees exactly their own takeaway request',
  (select count(*) from takeaway_requests), 1);

select pg_temp.expect_count('guest A sees their request and not guest B''s',
  (select count(*) from takeaway_requests where id = :request_b::uuid), 0);

select pg_temp.expect_count('guest A sees their own booking',
  (select count(*) from booking_requests), 1);

select pg_temp.expect_count('guest A sees only their own session row',
  (select count(*) from customer_sessions), 1);

select pg_temp.expect_no_access('guest A still cannot read staff profiles',
  'select count(*) from staff_profiles');

reset role;

-- ============================================================ guest B =======
select pg_temp.become_guest(:session_b::uuid);

select pg_temp.expect_count('guest B sees exactly their own takeaway request',
  (select count(*) from takeaway_requests), 1);

select pg_temp.expect_count('guest B cannot see guest A''s request',
  (select count(*) from takeaway_requests where id = :request_a::uuid), 0);

select pg_temp.expect_count('guest B has no bookings of their own',
  (select count(*) from booking_requests), 0);

reset role;

-- A forged/absent session id yields nothing at all.
select pg_temp.become_guest('00000000-0000-4000-8000-0000000000ff');
select pg_temp.expect_count('unknown session sees no requests',
  (select count(*) from takeaway_requests), 0);
reset role;

-- ============================================================ ORDER_STAFF ===
select pg_temp.become_staff(:u_order::uuid);

select pg_temp.expect_count('order staff sees every takeaway request',
  (select count(*) from takeaway_requests), 2);

select pg_temp.expect_count('order staff sees the full menu including drafts',
  (select count(*) from menu_items), 2);

do $$
declare updated integer;
begin
  update takeaway_requests set state = 'ACCEPTED'
  where id = 'eeeeeeee-0000-4000-8000-00000000000a';
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'RLS MATRIX FAIL — order staff must be able to accept a takeaway request';
  end if;
end $$;

-- Order staff must not touch bookings.
do $$
declare updated integer;
begin
  update booking_requests set state = 'CONFIRMED';
  get diagnostics updated = row_count;
  if updated <> 0 then
    raise exception 'RLS MATRIX FAIL — order staff must NOT be able to confirm a booking';
  end if;
end $$;

-- ...nor publish menu content.
do $$
declare updated integer;
begin
  update menu_items set name = 'Renamed by order staff';
  get diagnostics updated = row_count;
  if updated <> 0 then
    raise exception 'RLS MATRIX FAIL — order staff must NOT be able to edit the menu';
  end if;
end $$;

reset role;

-- ========================================================== BOOKING_STAFF ===
select pg_temp.become_staff(:u_booking::uuid);

do $$
declare updated integer;
begin
  update booking_requests set state = 'CONFIRMED';
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'RLS MATRIX FAIL — booking staff must be able to confirm a booking';
  end if;
end $$;

do $$
declare updated integer;
begin
  update takeaway_requests set state = 'PREPARING'
  where id = 'eeeeeeee-0000-4000-8000-00000000000a';
  get diagnostics updated = row_count;
  if updated <> 0 then
    raise exception 'RLS MATRIX FAIL — booking staff must NOT advance the takeaway queue';
  end if;
end $$;

reset role;

-- =============================================================== AUDITOR ====
select pg_temp.become_staff(:u_auditor::uuid);

select pg_temp.expect_count('auditor reads audit events',
  (select count(*) from audit_events), 0);   -- readable, currently empty

select pg_temp.expect_count('auditor reads every takeaway request',
  (select count(*) from takeaway_requests), 2);

select pg_temp.expect_count('auditor reads outbox health',
  (select count(*) from outbox_events), 0);

-- An auditor is strictly read-only.
do $$
declare updated integer;
begin
  update takeaway_requests set state = 'READY';
  get diagnostics updated = row_count;
  if updated <> 0 then
    raise exception 'RLS MATRIX FAIL — auditor must never write';
  end if;
end $$;

do $$
declare updated integer;
begin
  update feature_flags set is_enabled = true;
  get diagnostics updated = row_count;
  if updated <> 0 then
    raise exception 'RLS MATRIX FAIL — auditor must not change feature flags';
  end if;
end $$;

reset role;

-- ================================================================ MANAGER ===
select pg_temp.become_staff(:u_manager::uuid);

select pg_temp.expect_count('manager reads feature flags',
  (select count(*) from feature_flags), 1);

do $$
declare updated integer;
begin
  update feature_flags set is_enabled = false;
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'RLS MATRIX FAIL — manager must be able to manage feature flags';
  end if;
end $$;

do $$
declare updated integer;
begin
  update menu_items set name = 'Renamed by manager' where id = 'cccccccc-0000-4000-8000-000000000002';
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'RLS MATRIX FAIL — manager must be able to edit menu content';
  end if;
end $$;

-- Staff administration is owner-only.
do $$
declare updated integer;
begin
  update staff_profiles set display_name = 'Renamed by manager'
  where id = 'a1000000-0000-4000-8000-000000000003';
  get diagnostics updated = row_count;
  if updated <> 0 then
    raise exception 'RLS MATRIX FAIL — manager must NOT administer staff accounts';
  end if;
end $$;

reset role;

-- ================================================================== OWNER ===
select pg_temp.become_staff(:u_owner::uuid);

do $$
declare updated integer;
begin
  update staff_profiles set display_name = 'Renamed by owner'
  where id = 'a1000000-0000-4000-8000-000000000003';
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'RLS MATRIX FAIL — owner must be able to administer staff';
  end if;
end $$;

select pg_temp.expect_count('owner reads every menu version',
  (select count(*) from menu_versions), 2);

reset role;

-- ========================================================= service worker ===
-- service_role bypasses RLS; the server layers its own authorization on top.
set local role service_role;

select pg_temp.expect_count('service worker sees all menu versions',
  (select count(*) from menu_versions), 2);

select pg_temp.expect_count('service worker sees all requests',
  (select count(*) from takeaway_requests), 2);

select pg_temp.expect_count('service worker sees confirmation tokens',
  (select count(*) from confirmation_tokens), 0);

reset role;

-- ================================================== MFA policy visibility ===
-- Owner and manager are the accounts the deployment policy requires MFA for.
do $$
declare in_scope integer;
begin
  select count(*) into in_scope from staff_requiring_mfa;
  if in_scope <> 2 then
    raise exception 'EXPECTED owner and manager to be in MFA scope, found %', in_scope;
  end if;
end $$;

rollback;

\echo 'PASS: RLS allow/deny matrix holds for anon, guest A/B, all five roles, and the service worker.'
