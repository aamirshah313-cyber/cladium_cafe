-- Runbook Step 8 schema tests.
--
-- Proves the core content schema ACCEPTS valid data and REJECTS invalid
-- prices and states. Runs entirely inside a transaction that is rolled back,
-- so it leaves no rows behind.
--
-- Run with: npm run db:test:schema   (requires the local stack)

\set ON_ERROR_STOP on

begin;

-- Fixed ids so assertions can reference them.
\set version_a '''11111111-1111-4111-8111-111111111111'''
\set version_b '''22222222-2222-4222-8222-222222222222'''
\set category_a '''33333333-3333-4333-8333-333333333333'''
\set item_a '''44444444-4444-4444-8444-444444444444'''

\set staff_a '''77777777-7777-4777-8777-777777777777'''
\set auth_user_a '''88888888-8888-4888-8888-888888888888'''

-- ------------------------------------------------------------- valid setup --
-- A real staff profile, so approval foreign keys resolve. Local test data
-- only; this transaction is rolled back.
insert into auth.users (id, instance_id, aud, role, email)
values (:auth_user_a::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'staff.test@example.invalid');

insert into staff_profiles (id, user_id, display_name)
values (:staff_a::uuid, :auth_user_a::uuid, 'Test Manager');

insert into staff_role_memberships (staff_profile_id, role)
values (:staff_a::uuid, 'MANAGER');

insert into menu_versions (id, version_number, source_checksum)
values (:version_a::uuid, 1, 'checksum-aaaaaaaaaaaaaaaa');

insert into menu_versions (id, version_number, source_checksum)
values (:version_b::uuid, 2, 'checksum-bbbbbbbbbbbbbbbb');

insert into menu_categories (id, menu_version_id, stable_id, name)
values (:category_a::uuid, :version_a::uuid, 'sandwiches', 'Sandwiches');

insert into menu_items (id, menu_version_id, category_id, stable_id, name, base_price_pkr)
values (:item_a::uuid, :version_a::uuid, :category_a::uuid, 'cladium-special-sandwich',
        'Cladium Special Sandwich', 1399);

insert into menu_variants (menu_version_id, item_id, stable_id, label, price_pkr)
values (:version_a::uuid, :item_a::uuid, 'karahi-half', 'half', 1399);

-- Availability defaults to UNKNOWN, never to available/unavailable.
do $$
declare v availability_status;
begin
  select availability into v from menu_items where stable_id = 'cladium-special-sandwich';
  if v <> 'UNKNOWN' then
    raise exception 'EXPECTED availability default UNKNOWN, got %', v;
  end if;
end $$;

-- A zero price is legal (a free item); a negative one is not.
insert into menu_items (menu_version_id, category_id, stable_id, name, base_price_pkr)
values (:version_a::uuid, :category_a::uuid, 'free-water', 'Complimentary Water', 0);

-- ----------------------------------------------------- rejection assertions --
-- Each block performs an illegal write and fails the run if it is accepted.

do $$
declare ok boolean := false;
begin
  begin
    insert into menu_items (menu_version_id, category_id, stable_id, name, base_price_pkr)
    values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
            'negative-item', 'Negative', -1);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: negative base_price_pkr'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into menu_variants (menu_version_id, item_id, stable_id, label, price_pkr)
    values ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444',
            'negative-variant', 'bad', -5);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: negative variant price_pkr'; end if;
end $$;

-- Money is integer PKR. Note what Postgres actually does with a fractional
-- value: it ROUNDS on the cast into an integer column rather than raising.
-- So the database guarantees integral STORAGE but is not itself a guard
-- against a fractional price arriving. That rejection happens at the
-- application trust boundary (integerPkrSchema in src/lib/schemas/common.ts,
-- covered by tests/unit/schemas.test.ts). This block pins the real behaviour
-- so nobody later mistakes the column type for input validation.
do $$
declare stored integer;
begin
  insert into menu_variants (menu_version_id, item_id, stable_id, label, price_pkr)
  values ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444',
          'fractional-probe', 'probe', 1399.5);

  select price_pkr into stored from menu_variants where stable_id = 'fractional-probe';

  if stored <> 1400 then
    raise exception 'EXPECTED Postgres to round 1399.5 to 1400 on cast, got %', stored;
  end if;
  if pg_typeof(stored)::text <> 'integer' then
    raise exception 'EXPECTED integer storage for money, got %', pg_typeof(stored);
  end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    execute $q$
      insert into menu_items (menu_version_id, category_id, stable_id, name, availability)
      values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
              'bad-availability', 'Bad', 'MAYBE')
    $q$;
  exception when invalid_text_representation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: invalid availability_status'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into menu_items (menu_version_id, category_id, stable_id, name, base_price_pkr)
    values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333',
            'cladium-special-sandwich', 'Duplicate', 100);
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: duplicate stable_id within a menu version'; end if;
end $$;

-- An item must not reference a category belonging to a different version.
do $$
declare ok boolean := false;
begin
  begin
    insert into menu_items (menu_version_id, category_id, stable_id, name, base_price_pkr)
    values ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
            'cross-version', 'Cross version', 100);
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: item referencing another version''s category'; end if;
end $$;

-- Publication requires a recorded approval.
do $$
declare ok boolean := false;
begin
  begin
    update menu_versions set published_at = now()
    where id = '11111111-1111-4111-8111-111111111111';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: publishing a menu version without approval'; end if;
end $$;

-- Exactly one published version may exist.
update menu_versions
set review_status = 'APPROVED', approved_by = '77777777-7777-4777-8777-777777777777', approved_at = now(), published_at = now()
where id = '11111111-1111-4111-8111-111111111111';

do $$
declare ok boolean := false;
begin
  begin
    update menu_versions
    set review_status = 'APPROVED', approved_by = '77777777-7777-4777-8777-777777777777', approved_at = now(), published_at = now()
    where id = '22222222-2222-4222-8222-222222222222';
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: a second published menu version'; end if;
end $$;

-- Never publish an unreviewed translation.
do $$
declare ok boolean := false;
begin
  begin
    insert into translations (entity_type, entity_id, field, locale, value, is_approved)
    values ('MENU_ITEM', '44444444-4444-4444-8444-444444444444', 'name', 'ur', 'اردو', true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: approved translation with no reviewer'; end if;
end $$;

-- An unapproved translation may be stored (it just is not served).
insert into translations (entity_type, entity_id, field, locale, value)
values ('MENU_ITEM', '44444444-4444-4444-8444-444444444444', 'name', 'ur', 'اردو');

do $$
declare ok boolean := false;
begin
  begin
    insert into media_assets (storage_path, media_type, mime_type, checksum, rights_holder, publish_state)
    values ('media/unapproved.jpg', 'IMAGE', 'image/jpeg', 'abc123', 'Cladium', 'PUBLISHED');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: publishing media without owner approval'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into pricing_rules (rule_type, name, rate_basis_points, effective_from, is_active)
    values ('TAX', 'Unapproved tax', 1600, now(), true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: active pricing rule without approval'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into pricing_rules (rule_type, name, effective_from)
    values ('TAX', 'No amount at all', now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: pricing rule with neither rate nor fixed amount'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into pricing_rules (rule_type, name, rate_basis_points, effective_from)
    values ('TAX', 'Over 100 percent', 10001, now());
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: rate above 10000 basis points'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into promotions (name, starts_at, publish_state)
    values ('Unapproved promo', now(), 'PUBLISHED');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: publishing a promotion without approval'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into promotions (name, starts_at, ends_at)
    values ('Backwards window', now(), now() - interval '1 day');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: promotion ending before it starts'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into feature_flags (environment, name, is_enabled)
    values ('production', 'TAKEAWAY_REQUESTS', true);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: enabled feature flag without an approver'; end if;
end $$;

-- A disabled flag needs no approver.
insert into feature_flags (environment, name, is_enabled)
values ('production', 'ONLINE_PAYMENT', false);

-- Hours: a same-day range must move forward; a midnight close must be flagged.
do $$
declare ok boolean := false;
begin
  begin
    insert into business_hours (day_of_week, opens_at, closes_at)
    values (1, '12:00', '00:00');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: same-day close before open'; end if;
end $$;

-- The real Cladium schedule: 12:00 to midnight, closing the next day.
insert into business_hours (day_of_week, opens_at, closes_at, closes_next_day)
values (1, '12:00', '00:00', true);

-- ------------------------------------------------------- trigger behaviour --
do $$
declare before_version integer;
        after_version integer;
        after_updated timestamptz;
        before_updated timestamptz;
begin
  select version, updated_at into before_version, before_updated
  from menu_items where stable_id = 'cladium-special-sandwich';

  update menu_items set name = 'Cladium Special Sandwich (v2)'
  where stable_id = 'cladium-special-sandwich';

  select version, updated_at into after_version, after_updated
  from menu_items where stable_id = 'cladium-special-sandwich';

  if after_version <> before_version + 1 then
    raise exception 'EXPECTED version bump on update: % -> %', before_version, after_version;
  end if;
  if after_updated < before_updated then
    raise exception 'EXPECTED updated_at to advance on update';
  end if;
end $$;

-- ------------------------------------------------------------- projections --
do $$
declare sensitive_visible integer;
begin
  insert into business_settings (key, value, is_sensitive)
  values ('public.name', '"Cladium Café & Resort"'::jsonb, false),
         ('internal.ops_note', '"internal only"'::jsonb, true);

  select count(*) into sensitive_visible
  from public_business_settings where key = 'internal.ops_note';

  if sensitive_visible <> 0 then
    raise exception 'EXPECTED sensitive settings to be excluded from the public projection';
  end if;
end $$;

-- --------------------------------------------------------------------- RLS --
do $$
declare unprotected text;
begin
  select string_agg(c.relname, ', ') into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'EXPECTED row level security on every table; missing on: %', unprotected;
  end if;
end $$;

-- ============================================================================
-- Step 9 — workflow schema: state machines, immutability, idempotency.
-- ============================================================================

\set session_a '''55555555-5555-4555-8555-555555555555'''
\set takeaway_a '''66666666-6666-4666-8666-666666666666'''

insert into customer_sessions (id, token_hash, expires_at)
values (:session_a::uuid, repeat('a', 64), now() + interval '1 day');

-- A guest submission lands in REQUESTED, never in an accepted state.
insert into takeaway_requests (
  id, session_id, guest_name, guest_phone, menu_version_id,
  subtotal_pkr, adjustments_pkr, total_pkr
) values (
  :takeaway_a::uuid, :session_a::uuid, 'Test Guest', '+92 300 0000000',
  '11111111-1111-4111-8111-111111111111', 1399, 0, 1399
);

do $$
declare ok boolean := false;
begin
  begin
    insert into takeaway_requests (
      session_id, guest_name, guest_phone, menu_version_id, subtotal_pkr, total_pkr, state
    ) values (
      '55555555-5555-4555-8555-555555555555', 'Test Guest', '+92 300 0000000',
      '11111111-1111-4111-8111-111111111111', 100, 100, 'ACCEPTED'
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: creating a takeaway request already ACCEPTED'; end if;
end $$;

-- Totals are arithmetic.
do $$
declare ok boolean := false;
begin
  begin
    insert into takeaway_requests (
      session_id, guest_name, guest_phone, menu_version_id, subtotal_pkr, adjustments_pkr, total_pkr
    ) values (
      '55555555-5555-4555-8555-555555555555', 'Test Guest', '+92 300 0000000',
      '11111111-1111-4111-8111-111111111111', 1000, 0, 9999
    );
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: total that is not subtotal + adjustments'; end if;
end $$;

-- Legal takeaway progression.
update takeaway_requests set state = 'ACCEPTED' where id = :takeaway_a::uuid;
update takeaway_requests set state = 'PREPARING' where id = :takeaway_a::uuid;
update takeaway_requests set state = 'READY' where id = :takeaway_a::uuid;
update takeaway_requests set state = 'COLLECTED' where id = :takeaway_a::uuid;

-- Illegal skips and reversals are refused.
do $$
declare ok boolean := false;
begin
  begin
    update takeaway_requests set state = 'REQUESTED'
    where id = '66666666-6666-4666-8666-666666666666';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: reversing COLLECTED back to REQUESTED'; end if;
end $$;

do $$
declare ok boolean := false;
        rid uuid;
begin
  insert into takeaway_requests (
    session_id, guest_name, guest_phone, menu_version_id, subtotal_pkr, total_pkr
  ) values (
    '55555555-5555-4555-8555-555555555555', 'Skip Test', '+92 300 0000000',
    '11111111-1111-4111-8111-111111111111', 500, 500
  ) returning id into rid;

  begin
    update takeaway_requests set state = 'READY' where id = rid;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: REQUESTED skipping straight to READY'; end if;
end $$;

-- Snapshot lines are immutable and self-consistent.
insert into takeaway_items (
  takeaway_request_id, item_name, unit_price_pkr, quantity, line_total_pkr
) values (:takeaway_a::uuid, 'Cladium Special Sandwich', 1399, 2, 2798);

do $$
declare ok boolean := false;
begin
  begin
    insert into takeaway_items (takeaway_request_id, item_name, unit_price_pkr, quantity, line_total_pkr)
    values ('66666666-6666-4666-8666-666666666666', 'Bad maths', 100, 3, 250);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: line_total that is not unit_price * quantity'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    update takeaway_items set unit_price_pkr = 1 where takeaway_request_id = '66666666-6666-4666-8666-666666666666';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: mutating an immutable snapshot line'; end if;
end $$;

-- Booking: only staff-legal transitions.
do $$
declare ok boolean := false;
        bid uuid;
begin
  insert into booking_requests (session_id, guest_name, guest_phone, requested_at, party_size)
  values ('55555555-5555-4555-8555-555555555555', 'Booking Guest', '+92 300 0000000',
          now() + interval '2 days', 4)
  returning id into bid;

  update booking_requests set state = 'CONFIRMED' where id = bid;
  update booking_requests set state = 'SEATED' where id = bid;
  update booking_requests set state = 'COMPLETED' where id = bid;

  begin
    update booking_requests set state = 'NO_SHOW' where id = bid;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: NO_SHOW after COMPLETED'; end if;
end $$;

-- Event: a quote cannot appear without staff attribution, and QUOTED
-- requires an actual amount.
do $$
declare ok boolean := false;
        eid uuid;
begin
  insert into event_requests (session_id, guest_name, guest_phone, event_type, requested_at)
  values ('55555555-5555-4555-8555-555555555555', 'Party Guest', '+92 300 0000000',
          'Birthday', now() + interval '10 days')
  returning id into eid;

  update event_requests set state = 'REQUESTED' where id = eid;

  begin
    update event_requests set state = 'QUOTED' where id = eid;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: QUOTED without a quoted amount'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    insert into event_requests (session_id, guest_name, guest_phone, event_type, requested_at, quoted_amount_pkr)
    values ('55555555-5555-4555-8555-555555555555', 'Party Guest', '+92 300 0000000',
            'Birthday', now() + interval '10 days', 8000);
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: a quote with no staff attribution'; end if;
end $$;

-- Confirmation tokens are single use.
do $$
declare ok boolean := false;
        tid uuid;
begin
  insert into confirmation_tokens (token_hash, session_id, action, review_hash, expires_at)
  values (repeat('b', 64), '55555555-5555-4555-8555-555555555555', 'TAKEAWAY_REQUEST',
          repeat('c', 64), now() + interval '15 minutes')
  returning id into tid;

  update confirmation_tokens set used_at = now() where id = tid;

  begin
    update confirmation_tokens set used_at = now() where id = tid;
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: reusing a spent confirmation token'; end if;
end $$;

-- Idempotency scope is unique.
do $$
declare ok boolean := false;
begin
  insert into idempotency_keys (actor_key, operation, idempotency_key, request_fingerprint, expires_at)
  values ('session:abc', 'takeaway.submit', repeat('k', 24), repeat('f', 64), now() + interval '1 day');

  begin
    insert into idempotency_keys (actor_key, operation, idempotency_key, request_fingerprint, expires_at)
    values ('session:abc', 'takeaway.submit', repeat('k', 24), repeat('g', 64), now() + interval '1 day');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: duplicate idempotency scope'; end if;
end $$;

-- Webhook deduplication.
do $$
declare ok boolean := false;
begin
  insert into webhook_events (provider, provider_event_id, signature_valid, timestamp_valid, expires_at)
  values ('VAPI', 'toolcall-123', true, true, now() + interval '7 days');

  begin
    insert into webhook_events (provider, provider_event_id, signature_valid, timestamp_valid, expires_at)
    values ('VAPI', 'toolcall-123', true, true, now() + interval '7 days');
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: duplicate provider event id'; end if;
end $$;

-- An unverified webhook can never be marked processed.
do $$
declare ok boolean := false;
begin
  begin
    insert into webhook_events (provider, provider_event_id, signature_valid, timestamp_valid,
                                processing_state, expires_at)
    values ('VAPI', 'toolcall-unverified', false, true, 'PROCESSED', now() + interval '7 days');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: processing a webhook with an invalid signature'; end if;
end $$;

-- History tables are append-only.
do $$
declare ok boolean := false;
begin
  insert into status_events (entity_type, entity_id, new_state, actor_type)
  values ('TAKEAWAY_REQUEST', '66666666-6666-4666-8666-666666666666', 'REQUESTED', 'GUEST');

  begin
    update status_events set new_state = 'ACCEPTED'
    where entity_id = '66666666-6666-4666-8666-666666666666';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: updating an append-only status event'; end if;
end $$;

do $$
declare ok boolean := false;
begin
  begin
    delete from status_events where entity_id = '66666666-6666-4666-8666-666666666666';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: deleting an append-only status event'; end if;
end $$;

-- A staff-attributed event must name the actor.
do $$
declare ok boolean := false;
begin
  begin
    insert into status_events (entity_type, entity_id, new_state, actor_type)
    values ('TAKEAWAY_REQUEST', '66666666-6666-4666-8666-666666666666', 'ACCEPTED', 'STAFF');
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'EXPECTED rejection: STAFF status event with no actor_id'; end if;
end $$;

-- The optional conversation_summaries table must not exist yet.
do $$
begin
  if to_regclass('public.conversation_summaries') is not null then
    raise exception 'conversation_summaries exists but is not approved for use yet';
  end if;
end $$;

rollback;

\echo 'PASS: schema accepts valid content and rejects invalid prices, states, and transitions.'
