-- Atomic claim-or-report for `idempotency_keys`, supporting the Postgres
-- `IdempotencyStore` adapter (`src/lib/db/postgres-idempotency-store.ts`).
--
-- Why a function rather than a PostgREST call: `IdempotencyStore.findOrBegin`
-- is specified as ONE atomic store operation -- "check and, if absent (or
-- FAILED), write the fresh IN_PROGRESS record within the same synchronous
-- turn, with no await in between." That contract exists because a real
-- double-click (two genuinely concurrent callers, not two sequential ones)
-- otherwise lets both read "no record yet" and both execute the mutation.
-- PostgREST cannot express "conditionally upsert, else return the row that
-- blocked you" in a single statement, so the whole decision lives here.
--
-- Returns ZERO rows when the caller may proceed (it now holds a fresh
-- IN_PROGRESS record), and exactly ONE row -- the record that blocked it --
-- otherwise. That mirrors the interface's `null`-means-proceed contract.
--
-- Additive only: no existing object is altered or dropped, keeping this
-- project's zero-destructive-DDL migration discipline intact (D-046).

create function idempotency_find_or_begin(
  p_actor_key text,
  p_operation text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_now timestamptz,
  p_expires_at timestamptz
) returns setof idempotency_keys
language plpgsql
as $$
begin
  -- One statement decides everything. A brand-new key inserts. A prior
  -- FAILED attempt with the SAME fingerprint is a safe retry, so it is
  -- re-armed in place. Every other conflict -- IN_PROGRESS, SUCCEEDED, or
  -- FAILED with a DIFFERENT fingerprint -- matches no row here, leaving the
  -- stored record untouched so it can be reported back as the blocker.
  insert into idempotency_keys (
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
    where idempotency_keys.status = 'FAILED'
      and idempotency_keys.request_fingerprint = excluded.request_fingerprint;

  -- FOUND is true when the insert applied or the conditional update matched;
  -- either way the caller now owns a fresh IN_PROGRESS record.
  if found then
    return;
  end if;

  return query
    select *
    from idempotency_keys
    where actor_key = p_actor_key
      and operation = p_operation
      and idempotency_key = p_idempotency_key;
end;
$$;

comment on function idempotency_find_or_begin(text, text, text, text, timestamptz, timestamptz) is
  'Atomically claims an idempotency key or returns the record blocking it. Zero rows means "proceed". Deliberately does not treat expired rows as absent: the domain interface has no expiry semantics, and inventing them here would make the Postgres store behave differently from the in-memory one.';

-- Invoker rights on purpose: no `security definer`. service_role already has
-- full access to this table, so definer rights would add privilege
-- escalation for no benefit. Postgres grants EXECUTE on new functions to
-- PUBLIC by default and `20260830044140_fix_default_table_privileges.sql`
-- revokes the named roles but not PUBLIC, so PUBLIC is revoked explicitly
-- here. Even without that, an anon caller would fail on idempotency_keys'
-- own grants -- this is defence in depth, not the only barrier.
revoke execute on function
  idempotency_find_or_begin(text, text, text, text, timestamptz, timestamptz)
  from public;

grant execute on function
  idempotency_find_or_begin(text, text, text, text, timestamptz, timestamptz)
  to service_role;
