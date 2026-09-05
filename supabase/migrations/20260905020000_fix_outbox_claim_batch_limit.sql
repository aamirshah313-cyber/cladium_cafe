-- Fixes a real, reproduced correctness bug in `outbox_claim_batch()`
-- (introduced in 20260904214500_outbox_dispatcher_functions.sql, D-068):
-- called through PostgREST (never through a direct psql connection), it
-- was observed -- intermittently, but repeatedly and confirmed with
-- before/after row dumps -- to claim MORE than `p_limit` rows. A concrete
-- case: 3 PENDING rows in the table, `p_limit = 2`, and all 3 came back
-- CLAIMED with the trigger-bumped version confirming a single real UPDATE
-- touched all three, not two separate operations.
--
-- Root cause not conclusively identified: `EXPLAIN (ANALYZE, BUFFERS)`
-- against the exact same WHERE clause, run directly in psql, always
-- produced a correct plan touching exactly `p_limit` rows (`loops=1`
-- throughout, no re-scan) -- repeated with and without the stale-claim OR
-- branch. `pg_proc` confirmed no duplicate/overloaded definition existed
-- to explain non-deterministic dispatch. The discrepancy is specifically
-- between direct SQL and PostgREST's invocation of the same function, and
-- further isolating that gap was not pursued to conclusion.
--
-- Fixed by removing the pattern that could be sensitive to whatever the
-- cause is, rather than continuing to chase an unconfirmed one: the
-- previous body used `UPDATE ... WHERE id IN (SELECT ... LIMIT p_limit
-- FOR UPDATE SKIP LOCKED)` -- a correlated subquery evaluated inside the
-- UPDATE's own WHERE clause. This version selects the candidate ids into
-- a plain array variable FIRST, as a completely separate, already-
-- materialized value, and only then runs a second statement with a plain
-- `WHERE id = ANY(v_ids)` -- there is no subquery left for any planner
-- choice or connection-level artifact to reinterpret differently on a
-- second look. `FOR UPDATE SKIP LOCKED` is preserved on the id-selection
-- step, so two concurrent callers still cannot double-claim the same row.

create or replace function outbox_claim_batch(
  p_limit integer,
  p_now timestamptz,
  p_stale_claim_ms integer
) returns setof outbox_events
language plpgsql
as $$
declare
  v_ids uuid[];
begin
  select array_agg(c.id) into v_ids
  from (
    select id
    from outbox_events
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
  update outbox_events
  set status = 'CLAIMED',
      claimed_at = p_now
  where id = any(v_ids)
  returning *;
end;
$$;

comment on function outbox_claim_batch(integer, timestamptz, integer) is
  'Atomically claims up to p_limit due or stale-claimed outbox rows, oldest first, skipping rows another worker holds. Returns the claimed rows with the trigger-bumped version. Candidate ids are materialized into a plain array before the UPDATE runs (see this migration''s own comment for why) -- fixes a real over-claiming bug found via PostgREST, never reproduced via direct SQL.';

-- CREATE OR REPLACE preserves the function's existing grants (PUBLIC
-- revoked, service_role granted, from 20260904214500), so nothing needs
-- re-granting here.
