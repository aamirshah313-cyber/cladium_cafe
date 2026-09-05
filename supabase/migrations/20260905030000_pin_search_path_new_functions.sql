-- Pins `search_path = ''` on the six functions added in
-- 20260904202500/20260904214500/20260905010000/20260905020000, closing a
-- real gap found by Supabase's own security advisor (`get_advisors`,
-- `function_search_path_mutable`) immediately after those migrations were
-- first applied to staging.
--
-- Every other function in this project already does this --
-- `set_row_updated()` (20260824120001) and every helper in
-- `rls_helpers.sql` set `search_path = ''` "so the function cannot be
-- hijacked by a caller-controlled schema." These six were written without
-- it. Every one of them runs as `service_role` (the most privileged role
-- in this database), so this was worth fixing immediately.
--
-- This CANNOT be a bare `ALTER FUNCTION ... SET search_path` (which was
-- the first draft of this migration, caught before it was ever applied
-- anywhere): with an empty search_path, *no* unqualified relation name
-- resolves -- not even `public` ones -- and all six function bodies
-- reference their tables unqualified (`idempotency_keys`, `outbox_events`,
-- `menu_versions`, etc.). Applying a bare ALTER would have made every one
-- of them fail with "relation does not exist" on its very next call.
-- Every table reference below is schema-qualified as `public.x`; built-ins
-- used inside (`make_interval`, `jsonb_to_recordset`, `array_agg`, `now`,
-- `coalesce`) need no qualification -- `pg_catalog` is always implicitly
-- searched regardless of `search_path`, which is exactly why the
-- pre-existing `rls_helpers.sql` functions already rely on the same thing.
--
-- `CREATE OR REPLACE FUNCTION` (not `ALTER`) because the body itself
-- changes; it preserves each function's existing grants (PUBLIC revoked,
-- service_role granted) exactly as the prior fix's own comment already
-- established.

create or replace function idempotency_find_or_begin(
  p_actor_key text,
  p_operation text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_now timestamptz,
  p_expires_at timestamptz
) returns setof idempotency_keys
language plpgsql
set search_path = ''
as $$
begin
  insert into public.idempotency_keys as t (
    actor_key,
    operation,
    idempotency_key,
    request_fingerprint,
    status,
    result_entity_type,
    result_entity_id,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_actor_key,
    p_operation,
    p_idempotency_key,
    p_request_fingerprint,
    'IN_PROGRESS',
    null,
    null,
    p_expires_at,
    p_now,
    p_now
  )
  on conflict (actor_key, operation, idempotency_key) do update
    set status = 'IN_PROGRESS',
        result_entity_type = null,
        result_entity_id = null,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    where t.status = 'FAILED'
      and t.request_fingerprint = excluded.request_fingerprint;

  if found then
    return;
  end if;

  return query
    select *
    from public.idempotency_keys
    where actor_key = p_actor_key
      and operation = p_operation
      and idempotency_key = p_idempotency_key;
end;
$$;

comment on function idempotency_find_or_begin(text, text, text, text, timestamptz, timestamptz) is
  'Atomically claims an idempotency key or returns the record blocking it. Zero rows means "proceed". Deliberately does not treat expired rows as absent: the domain interface has no expiry semantics, and inventing them here would make the Postgres store behave differently from the in-memory one.';

create or replace function outbox_claim_batch(
  p_limit integer,
  p_now timestamptz,
  p_stale_claim_ms integer
) returns setof outbox_events
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(c.id) into v_ids
  from (
    select id
    from public.outbox_events
    where (status = 'PENDING' and next_attempt_at <= p_now)
       or (
         status = 'CLAIMED'
         and claimed_at is not null
         and claimed_at <= p_now - make_interval(secs => p_stale_claim_ms / 1000.0)
       )
    order by coalesce(next_attempt_at, created_at) asc
    limit p_limit
    for update skip locked
  ) c;

  if v_ids is null then
    return;
  end if;

  return query
  update public.outbox_events
  set status = 'CLAIMED',
      claimed_at = p_now
  where id = any(v_ids)
  returning *;
end;
$$;

comment on function outbox_claim_batch(integer, timestamptz, integer) is
  'Atomically claims up to p_limit due or stale-claimed outbox rows, oldest first, skipping rows another worker holds. Returns the claimed rows with the trigger-bumped version. Candidate ids are materialized into a plain array before the UPDATE runs -- fixes a real over-claiming bug found via PostgREST, never reproduced via direct SQL (20260905020000).';

create or replace function outbox_mark_retry(
  p_id uuid,
  p_expected_version integer,
  p_next_attempt_at timestamptz,
  p_last_error text
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.outbox_events
  set status = 'PENDING',
      attempt_count = attempt_count + 1,
      next_attempt_at = p_next_attempt_at,
      claimed_at = null,
      last_error = p_last_error
  where id = p_id
    and version = p_expected_version;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function outbox_mark_retry(uuid, integer, timestamptz, text) is
  'Returns the row to PENDING with an incremented attempt count and a new backoff time. False means the expected version did not match.';

create or replace function outbox_mark_terminal(
  p_id uuid,
  p_expected_version integer,
  p_last_error text,
  p_now timestamptz
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.outbox_events
  set status = 'FAILED',
      attempt_count = attempt_count + 1,
      failed_permanently_at = p_now,
      last_error = p_last_error
  where id = p_id
    and version = p_expected_version;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function outbox_mark_terminal(uuid, integer, text, timestamptz) is
  'Marks the row permanently failed with an incremented attempt count. False means the expected version did not match.';

create or replace function menu_import_draft(
  p_source_checksum text,
  p_source_references jsonb,
  p_categories jsonb,
  p_items jsonb,
  p_variants jsonb
) returns menu_versions
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.menu_versions;
  v_new public.menu_versions;
  v_next_version integer;
begin
  select * into v_existing from public.menu_versions where source_checksum = p_source_checksum;
  if found then
    return v_existing;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version from public.menu_versions;

  insert into public.menu_versions (version_number, source_checksum, source_references)
  values (v_next_version, p_source_checksum, p_source_references)
  returning * into v_new;

  insert into public.menu_categories (menu_version_id, stable_id, name, sort_order)
  select v_new.id, c.stable_id, c.name, c.sort_order
  from jsonb_to_recordset(p_categories) as c(stable_id text, name text, sort_order integer);

  insert into public.menu_items (
    menu_version_id, category_id, stable_id, name, description, group_label,
    base_price_pkr, is_signature, serves, quantity_label, served_with, sort_order
  )
  select
    v_new.id, cat.id, i.stable_id, i.name, null, i.group_label,
    i.base_price_pkr, i.is_signature, i.serves, i.quantity_label, i.served_with, i.sort_order
  from jsonb_to_recordset(p_items) as i(
    stable_id text, category_stable_id text, group_label text, name text,
    base_price_pkr integer, is_signature boolean, serves text, quantity_label text,
    served_with text, sort_order integer
  )
  join public.menu_categories cat
    on cat.menu_version_id = v_new.id and cat.stable_id = i.category_stable_id;

  insert into public.menu_variants (menu_version_id, item_id, stable_id, label, price_pkr, sort_order)
  select v_new.id, it.id, va.stable_id, va.label, va.price_pkr, va.sort_order
  from jsonb_to_recordset(p_variants) as va(
    stable_id text, item_stable_id text, label text, price_pkr integer, sort_order integer
  )
  join public.menu_items it
    on it.menu_version_id = v_new.id and it.stable_id = va.item_stable_id;

  return v_new;
end;
$$;

comment on function menu_import_draft(text, jsonb, jsonb, jsonb, jsonb) is
  'Executes modules/menu/import-plan.ts''s plan for real: one DRAFT menu_versions row plus its categories/items/variants, or the existing row when source_checksum was already imported. Never assigns publish_state other than DRAFT.';

create or replace function menu_publish_version(
  p_version_number integer
) returns menu_versions
language plpgsql
set search_path = ''
as $$
declare
  v_candidate public.menu_versions;
  v_current public.menu_versions;
begin
  select * into v_candidate from public.menu_versions where version_number = p_version_number for update;
  if not found then
    raise exception 'menu version % does not exist', p_version_number using errcode = '23514';
  end if;

  if v_candidate.published_at is not null then
    raise exception 'menu version % is already published', p_version_number
      using errcode = '23514';
  end if;
  if v_candidate.review_status <> 'APPROVED'
     or v_candidate.approved_by is null
     or v_candidate.approved_at is null then
    raise exception 'menu version % is not approved for publish', p_version_number
      using errcode = '23514';
  end if;

  select * into v_current from public.menu_versions where published_at is not null for update;
  if found and v_current.id <> v_candidate.id then
    update public.menu_categories set publish_state = 'ARCHIVED'
      where menu_version_id = v_current.id and publish_state = 'PUBLISHED';
    update public.menu_items set publish_state = 'ARCHIVED'
      where menu_version_id = v_current.id and publish_state = 'PUBLISHED';
    update public.menu_variants set publish_state = 'ARCHIVED'
      where menu_version_id = v_current.id and publish_state = 'PUBLISHED';
    update public.menu_versions set published_at = null where id = v_current.id;
  end if;

  update public.menu_categories set publish_state = 'PUBLISHED'
    where menu_version_id = v_candidate.id and publish_state = 'DRAFT';
  update public.menu_items set publish_state = 'PUBLISHED'
    where menu_version_id = v_candidate.id and publish_state = 'DRAFT';
  update public.menu_variants set publish_state = 'PUBLISHED'
    where menu_version_id = v_candidate.id and publish_state = 'DRAFT';

  update public.menu_versions set published_at = now()
    where id = v_candidate.id
    returning * into v_candidate;

  return v_candidate;
end;
$$;

comment on function menu_publish_version(integer) is
  'Executes modules/menu/publish-plan.ts''s plan for real: publishes an approved DRAFT version, atomically unpublishing and archiving whatever was previously published. Approval itself (review_status/approved_by/approved_at) is a separate, prior action -- this function only checks it was already done.';
