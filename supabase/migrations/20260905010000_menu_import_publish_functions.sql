-- Executes, for real, the import and publish plans `modules/menu/
-- import-plan.ts` and `publish-plan.ts` have computed since Step 11 with no
-- database connection of their own ("a later, separately reviewed step
-- would execute [this] inside a transaction"). Supports the staff menu
-- review/publish page (`src/modules/menu/admin-service.ts`).
--
-- Both are functions rather than PostgREST calls for the same reason every
-- other multi-statement primitive in this project is: PostgREST cannot
-- express a multi-table transactional write, and menu_import_draft in
-- particular needs to resolve stable-id references (category_stable_id,
-- item_stable_id) to real uuids assigned moments earlier in the same
-- transaction -- there is no single REST call for that.
--
-- Neither function assigns publish_state other than the DRAFT every
-- imported row starts in, or approves anything -- both mirror the exact
-- preconditions their TypeScript planning counterparts already encode, so
-- a caller cannot get a plan approved here that those modules would have
-- rejected. Invoker rights throughout (service_role already has full
-- access; security definer would add privilege escalation for nothing).
-- PUBLIC is revoked explicitly because Postgres grants EXECUTE on new
-- functions to PUBLIC by default and 20260830044140 revokes the named
-- roles but not PUBLIC (see D-065). Additive DDL only (D-046).

create function menu_import_draft(
  p_source_checksum text,
  p_source_references jsonb,
  p_categories jsonb,
  p_items jsonb,
  p_variants jsonb
) returns menu_versions
language plpgsql
as $$
declare
  v_existing menu_versions;
  v_new menu_versions;
  v_next_version integer;
begin
  -- Mirrors MenuImportPlanAction.ALREADY_IMPORTED: a repeated import of the
  -- same source content is a safe no-op, never a duplicate version.
  select * into v_existing from menu_versions where source_checksum = p_source_checksum;
  if found then
    return v_existing;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version from menu_versions;

  insert into menu_versions (version_number, source_checksum, source_references)
  values (v_next_version, p_source_checksum, p_source_references)
  returning * into v_new;

  insert into menu_categories (menu_version_id, stable_id, name, sort_order)
  select v_new.id, c.stable_id, c.name, c.sort_order
  from jsonb_to_recordset(p_categories) as c(stable_id text, name text, sort_order integer);

  -- category_stable_id is resolved to the real category uuid this same
  -- transaction just assigned -- menu.json's items never carry a uuid,
  -- only the human-readable stable id import-plan.ts already validated.
  insert into menu_items (
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
  join menu_categories cat
    on cat.menu_version_id = v_new.id and cat.stable_id = i.category_stable_id;

  insert into menu_variants (menu_version_id, item_id, stable_id, label, price_pkr, sort_order)
  select v_new.id, it.id, va.stable_id, va.label, va.price_pkr, va.sort_order
  from jsonb_to_recordset(p_variants) as va(
    stable_id text, item_stable_id text, label text, price_pkr integer, sort_order integer
  )
  join menu_items it
    on it.menu_version_id = v_new.id and it.stable_id = va.item_stable_id;

  return v_new;
end;
$$;

comment on function menu_import_draft(text, jsonb, jsonb, jsonb, jsonb) is
  'Executes modules/menu/import-plan.ts''s plan for real: one DRAFT menu_versions row plus its categories/items/variants, or the existing row when source_checksum was already imported. Never assigns publish_state other than DRAFT.';

create function menu_publish_version(
  p_version_number integer
) returns menu_versions
language plpgsql
as $$
declare
  v_candidate menu_versions;
  v_current menu_versions;
begin
  -- FOR UPDATE: without it, two concurrent calls for the same version
  -- could both read published_at IS NULL before either writes, and since
  -- the later UPDATEs key on id rather than re-checking published_at, both
  -- would "succeed" -- the same class of race D-064/D-068 already found
  -- and fixed elsewhere. Locking here means the second call blocks until
  -- the first commits, then correctly sees the now-published row and
  -- raises "already published" instead of double-publishing.
  select * into v_candidate from menu_versions where version_number = p_version_number for update;
  if not found then
    raise exception 'menu version % does not exist', p_version_number using errcode = '23514';
  end if;

  -- Mirrors buildMenuPublishPlan's exact checks, so a caller cannot reach a
  -- state that module would have rejected -- reported here as a named
  -- precondition, not a bare constraint violation naming a column.
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

  -- Not explicit in publish-plan.ts's own rowTransitions (which covers only
  -- the incoming version), but leaving a superseded version's rows marked
  -- PUBLISHED forever has no upside -- publish_state's ARCHIVED value
  -- exists for exactly this. Unpublishing first is also what keeps
  -- menu_versions_single_published's partial unique index from ever being
  -- violated mid-transaction.
  select * into v_current from menu_versions where published_at is not null for update;
  if found and v_current.id <> v_candidate.id then
    update menu_categories set publish_state = 'ARCHIVED'
      where menu_version_id = v_current.id and publish_state = 'PUBLISHED';
    update menu_items set publish_state = 'ARCHIVED'
      where menu_version_id = v_current.id and publish_state = 'PUBLISHED';
    update menu_variants set publish_state = 'ARCHIVED'
      where menu_version_id = v_current.id and publish_state = 'PUBLISHED';
    update menu_versions set published_at = null where id = v_current.id;
  end if;

  update menu_categories set publish_state = 'PUBLISHED'
    where menu_version_id = v_candidate.id and publish_state = 'DRAFT';
  update menu_items set publish_state = 'PUBLISHED'
    where menu_version_id = v_candidate.id and publish_state = 'DRAFT';
  update menu_variants set publish_state = 'PUBLISHED'
    where menu_version_id = v_candidate.id and publish_state = 'DRAFT';

  update menu_versions set published_at = now()
    where id = v_candidate.id
    returning * into v_candidate;

  return v_candidate;
end;
$$;

comment on function menu_publish_version(integer) is
  'Executes modules/menu/publish-plan.ts''s plan for real: publishes an approved DRAFT version, atomically unpublishing and archiving whatever was previously published. Approval itself (review_status/approved_by/approved_at) is a separate, prior action -- this function only checks it was already done.';

revoke execute on function menu_import_draft(text, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function menu_publish_version(integer) from public;

grant execute on function menu_import_draft(text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function menu_publish_version(integer) to service_role;
