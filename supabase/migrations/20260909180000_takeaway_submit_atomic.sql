-- One transaction for a whole takeaway submission.
--
-- The TypeScript service previously wrote a submission as five sequential
-- calls: the request, its line snapshots, a status event, an audit event and
-- an outbox event. Through in-memory `Map`s that was harmless. Through
-- PostgREST it is five independent HTTP round-trips with no transaction
-- around them, and any failure part-way leaves a partial submission behind:
-- worst case a `takeaway_requests` row with no outbox event, which is an
-- order that exists and that no member of staff is ever notified about.
-- Nothing in the schema forbids that shape, so nothing would flag it.
--
-- A plpgsql function is one transaction. Either every row below is written
-- or none is, and the caller gets one error instead of a half-written
-- request. This is the same reason `menu_import_draft` exists rather than a
-- sequence of inserts from the application.
--
-- Invoker rights, matching `menu_import_draft`: `service_role` already has
-- full access, so `security definer` would add privilege escalation for
-- nothing. `search_path = ''` per D-073, which means every relation below is
-- schema-qualified. PUBLIC is revoked explicitly because Postgres grants
-- EXECUTE on new functions to PUBLIC by default and 20260830044140 revokes
-- the named roles but not PUBLIC (D-065). Additive DDL only (D-046).

create function takeaway_submit_request(p_payload jsonb) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_request        jsonb := p_payload -> 'request';
  v_status         jsonb := p_payload -> 'statusEvent';
  v_audit          jsonb := p_payload -> 'auditEvent';
  v_outbox         jsonb := p_payload -> 'outboxEvent';
  v_request_id     uuid  := (v_request ->> 'id')::uuid;
  v_session_id     uuid  := (v_request ->> 'sessionId')::uuid;
  v_menu_version   uuid;
  v_item           jsonb;
begin
  -- The menu version is carried as its human-readable number; the row's FK
  -- needs the id. Resolving it here rather than trusting a caller-supplied
  -- id means a submission can never be attached to a version the caller
  -- named but that does not exist.
  select mv.id into v_menu_version
  from public.menu_versions mv
  where mv.version_number = (v_request ->> 'menuVersionNumber')::integer;

  if v_menu_version is null then
    raise exception 'no menu version with version_number %',
      v_request ->> 'menuVersionNumber'
      using errcode = 'foreign_key_violation';
  end if;

  -- `takeaway_requests.session_id` carries a real foreign key into
  -- `customer_sessions`, and the guest-session layer only ever signs an id
  -- into a cookie — it has never inserted the row (D-078/D-079). Doing it
  -- here keeps that inside the same transaction as the request that needs
  -- it, rather than as a separate call that could succeed alone. The hash is
  -- computed by the caller so this shares one convention with
  -- `postgres-customer-session.ts` and needs no pgcrypto extension.
  if v_session_id is not null then
    insert into public.customer_sessions (id, token_hash, expires_at)
    values (
      v_session_id,
      v_request ->> 'sessionTokenHash',
      now() + interval '7 days'
    )
    on conflict (id) do nothing;
  end if;

  insert into public.takeaway_requests (
    id, session_id, guest_name, guest_phone, requested_collection_note, notes,
    state, menu_version_id, subtotal_pkr, adjustments_pkr, total_pkr,
    source_channel, created_at, updated_at, version
  ) values (
    v_request_id,
    v_session_id,
    v_request ->> 'guestName',
    v_request ->> 'guestPhone',
    v_request ->> 'requestedCollectionNote',
    v_request ->> 'notes',
    (v_request ->> 'state')::public.takeaway_state,
    v_menu_version,
    (v_request ->> 'subtotalPkr')::integer,
    (v_request ->> 'adjustmentsPkr')::integer,
    (v_request ->> 'totalPkr')::integer,
    (v_request ->> 'sourceChannel')::public.source_channel,
    (v_request ->> 'createdAt')::timestamptz,
    (v_request ->> 'createdAt')::timestamptz,
    (v_request ->> 'version')::integer
  );

  -- Line snapshots. `menu_item_id`/`menu_variant_id` are kept for
  -- traceability but are deliberately allowed to stay null: the snapshot's
  -- own name and price are the authoritative record, and "historical lines
  -- do not change when the menu changes" means a line must stay readable
  -- even after the row it came from is gone.
  --
  -- These were first resolved by matching `stable_id`, which was wrong twice
  -- over. The domain carries `menu_items.id` (see
  -- `modules/menu/guest-view-repository.ts`), so the match never succeeded;
  -- and because these are scalar subqueries, a miss writes null rather than
  -- raising, so every request would have quietly lost its line traceability
  -- while the transaction reported success. Matching on the id the domain
  -- actually holds fixes it, and the `menu_version_id` predicate stays so a
  -- line still cannot name a row belonging to some other menu version.
  for v_item in select * from jsonb_array_elements(p_payload -> 'items')
  loop
    insert into public.takeaway_items (
      id, takeaway_request_id, menu_item_id, menu_variant_id,
      item_name, variant_label, unit_price_pkr, quantity, line_total_pkr
    ) values (
      (v_item ->> 'id')::uuid,
      v_request_id,
      (select mi.id from public.menu_items mi
        where mi.menu_version_id = v_menu_version
          and mi.id = nullif(v_item ->> 'menuItemId','')::uuid),
      (select mvar.id from public.menu_variants mvar
        where mvar.menu_version_id = v_menu_version
          and mvar.id = nullif(v_item ->> 'variantId','')::uuid),
      v_item ->> 'name',
      v_item ->> 'variantLabel',
      (v_item ->> 'unitPricePkr')::integer,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'lineTotalPkr')::integer
    );
  end loop;

  insert into public.status_events (
    id, entity_type, entity_id, previous_state, new_state,
    actor_type, actor_id, request_version, correlation_id, metadata, created_at
  ) values (
    -- The domain's StatusEvent/AuditEvent carry no id of their own; the
    -- sinks mint one on write, so this does the same.
    coalesce(nullif(v_status ->> 'id','')::uuid, gen_random_uuid()),
    (v_status ->> 'entityType')::public.entity_type,
    v_request_id,
    v_status ->> 'previousState',
    v_status ->> 'newState',
    (v_status ->> 'actorType')::public.actor_type,
    nullif(v_status ->> 'actorId', '')::uuid,
    (v_status ->> 'requestVersion')::integer,
    nullif(v_status ->> 'correlationId', '')::uuid,
    coalesce(v_status -> 'metadata', '{}'::jsonb),
    (v_status ->> 'occurredAt')::timestamptz
  );

  insert into public.audit_events (
    id, action, category, actor_type, actor_id, entity_type, entity_id,
    correlation_id, metadata, created_at
  ) values (
    coalesce(nullif(v_audit ->> 'id','')::uuid, gen_random_uuid()),
    v_audit ->> 'action',
    (v_audit ->> 'category')::public.audit_event_category,
    (v_audit ->> 'actorType')::public.actor_type,
    nullif(v_audit ->> 'actorId', '')::uuid,
    v_audit ->> 'targetType',
    v_request_id,
    nullif(v_audit ->> 'correlationId', '')::uuid,
    coalesce(v_audit -> 'safeDetail', '{}'::jsonb),
    (v_audit ->> 'occurredAt')::timestamptz
  );

  -- Written last and in the same transaction as the request it announces.
  -- That ordering is the whole point: an order that exists but that staff
  -- are never told about is the failure this function prevents.
  insert into public.outbox_events (
    id, event_type, entity_type, entity_id, destination, payload,
    status, attempt_count, next_attempt_at, correlation_id, created_at, updated_at, version
  ) values (
    (v_outbox ->> 'id')::uuid,
    v_outbox ->> 'eventType',
    (v_outbox ->> 'entityType')::public.entity_type,
    v_request_id,
    v_outbox ->> 'destination',
    coalesce(v_outbox -> 'payload', '{}'::jsonb),
    (v_outbox ->> 'status')::public.outbox_status,
    (v_outbox ->> 'attemptCount')::integer,
    (v_outbox ->> 'nextAttemptAt')::timestamptz,
    nullif(v_outbox ->> 'correlationId', '')::uuid,
    (v_outbox ->> 'createdAt')::timestamptz,
    (v_outbox ->> 'createdAt')::timestamptz,
    (v_outbox ->> 'version')::integer
  );

  return v_request_id;
end;
$$;

revoke execute on function takeaway_submit_request(jsonb) from public;
grant execute on function takeaway_submit_request(jsonb) to service_role;
