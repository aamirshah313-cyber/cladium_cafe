-- Dispatcher operations for `outbox_events`, supporting the Postgres
-- `OutboxStore` adapter (`src/lib/db/postgres-outbox-store.ts`).
--
-- Three functions rather than PostgREST calls, each for a concrete reason:
--
-- * `outbox_claim_batch` must select, order, limit and update in ONE
--   statement. `OutboxStore.claimBatch` is specified as "a single atomic
--   operation, not a 'read due rows, then write CLAIMED' pair", because
--   two dispatchers otherwise both see the same rows as claimable before
--   either writes back. PostgREST cannot express an UPDATE whose target is
--   an ordered, limited subquery.
--
-- * `outbox_mark_retry` and `outbox_mark_terminal` need
--   `attempt_count = attempt_count + 1`. PostgREST sends literal values, so
--   the increment would have to be read first and written second -- two
--   statements, and a lost update whenever two workers resolve the same
--   claim.
--
-- `markDelivered` is deliberately absent: it sets only literals, so the
-- adapter does it through PostgREST as a plain conditional update.
--
-- None of these writes `version`. `outbox_events_set_updated` is a BEFORE
-- UPDATE trigger doing `new.version := old.version + 1`, so the database
-- owns the bump and every function here simply matches on the expected
-- value. Additive DDL only (D-046).

-- `for update skip locked` is what makes two dispatchers safe to run at
-- once: the second skips rows the first has locked instead of blocking on
-- them or claiming them twice. Stale claims are reclaimed so that a worker
-- crashing between claim and resolve cannot strand a row in CLAIMED
-- forever, silently un-retried.
create function outbox_claim_batch(
  p_limit integer,
  p_now timestamptz,
  p_stale_claim_ms integer
) returns setof outbox_events
language plpgsql
as $$
begin
  return query
  update outbox_events o
  set status = 'CLAIMED',
      claimed_at = p_now
  where o.id in (
    select c.id
    from outbox_events c
    where (c.status = 'PENDING' and c.next_attempt_at <= p_now)
       or (
         c.status = 'CLAIMED'
         and c.claimed_at is not null
         and c.claimed_at <= p_now - make_interval(secs => p_stale_claim_ms / 1000.0)
       )
    order by coalesce(c.next_attempt_at, c.created_at) asc
    limit p_limit
    for update skip locked
  )
  returning o.*;
end;
$$;

comment on function outbox_claim_batch(integer, timestamptz, integer) is
  'Atomically claims up to p_limit due or stale-claimed outbox rows, oldest first, skipping rows another worker holds. Returns the claimed rows with the trigger-bumped version.';

-- Returns false when the expected version no longer matches -- someone else
-- already resolved this claim. That is a normal outcome, not an error.
create function outbox_mark_retry(
  p_id uuid,
  p_expected_version integer,
  p_next_attempt_at timestamptz,
  p_last_error text
) returns boolean
language plpgsql
as $$
declare
  v_updated integer;
begin
  update outbox_events
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

create function outbox_mark_terminal(
  p_id uuid,
  p_expected_version integer,
  p_last_error text,
  p_now timestamptz
) returns boolean
language plpgsql
as $$
declare
  v_updated integer;
begin
  -- failed_permanently_at is set in the same statement as the status
  -- because outbox_events_failed_consistent requires it.
  update outbox_events
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

-- Invoker rights throughout: service_role already has full access to this
-- table, so `security definer` would add privilege escalation for nothing.
-- Postgres grants EXECUTE on new functions to PUBLIC by default and
-- 20260830044140 revokes the named roles but not PUBLIC, so PUBLIC is
-- revoked explicitly here (see D-065).
revoke execute on function outbox_claim_batch(integer, timestamptz, integer) from public;
revoke execute on function outbox_mark_retry(uuid, integer, timestamptz, text) from public;
revoke execute on function outbox_mark_terminal(uuid, integer, text, timestamptz) from public;

grant execute on function outbox_claim_batch(integer, timestamptz, integer) to service_role;
grant execute on function outbox_mark_retry(uuid, integer, timestamptz, text) to service_role;
grant execute on function outbox_mark_terminal(uuid, integer, text, timestamptz) to service_role;
