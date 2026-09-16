-- A shared, durable store for request rate limiting.
--
-- Every rate limit in the application was held in a per-process `Map`
-- (`createInMemoryRateLimiter`). On Vercel that is not a limit. Each function
-- instance keeps its own counters, a cold start begins at zero, and a burst
-- that fans out across N instances is allowed roughly N times the configured
-- maximum. The rules in `lib/http/route-rate-limits.ts` were correct; the
-- store underneath them could not enforce them. The staff sign-in rule
-- (5 attempts a minute, the one credential-guessing surface) was affected
-- the same way as every guest route.
--
-- ## Atomicity is the whole contract
--
-- `RateLimitStoreAdapter` requires increment-and-read to be one atomic
-- operation: read-then-write as two statements lets concurrent requests all
-- observe the same count and all pass. `insert ... on conflict do update ...
-- returning` is that single operation. A conflicting row is locked, so
-- concurrent callers on one key serialise on it and each receives its own
-- post-increment count. The integration tests fire genuinely concurrent
-- calls at one key and assert exactly `max` are allowed.
--
-- ## Keys are stored hashed
--
-- Callers key by session id, and the staff sign-in rule keys by the
-- *attempted* staff id. Neither belongs in a table that only ever needs
-- equality, so the adapter stores a SHA-256 hex digest and the column
-- refuses anything else.
--
-- ## Time comes from the caller
--
-- `RateLimiter.consume` accepts `now`, and every caller and test relies on
-- that. The window arithmetic therefore uses `p_now` rather than the
-- database clock, so this store behaves exactly like the in-memory one it
-- replaces. Function instances are NTP-synchronised; a few milliseconds of
-- skew moves a window boundary by a few milliseconds.
--
-- ## Rows are pruned, not left to grow
--
-- One row per distinct key (session x route), reused across windows, so the
-- table grows with distinct visitors rather than requests. `rate_limit_prune`
-- removes expired rows in bounded batches; the adapter calls it
-- opportunistically.
--
-- Conventions as for every function since D-065/D-073: invoker rights
-- (`service_role` already has what it needs, so `security definer` would add
-- escalation for nothing), `search_path = ''` with schema-qualified names,
-- EXECUTE revoked from PUBLIC explicitly. RLS is enabled with no policies:
-- anon and authenticated can reach nothing, and 20260830044140's default
-- privileges already strip their table grants. That same migration strips
-- `service_role` table grants for new tables too, so the grant below is
-- required, not decorative. Additive DDL only (D-046).

create table rate_limit_windows (
  key_hash  text        primary key
    constraint rate_limit_windows_key_hash_format check (key_hash ~ '^[0-9a-f]{64}$'),
  hit_count integer     not null
    constraint rate_limit_windows_hit_count_positive check (hit_count >= 1),
  reset_at  timestamptz not null
);

create index rate_limit_windows_reset_at_idx on rate_limit_windows (reset_at);

alter table rate_limit_windows enable row level security;

grant select, insert, update, delete on table rate_limit_windows to service_role;

create function rate_limit_consume(p_key_hash text, p_window_ms integer, p_now timestamptz)
returns table (out_hit_count integer, out_reset_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_window interval;
begin
  if p_window_ms is null or p_window_ms <= 0 then
    raise exception 'rate_limit_consume: window must be a positive number of milliseconds'
      using errcode = '22023';
  end if;
  if p_now is null then
    raise exception 'rate_limit_consume: now is required' using errcode = '22023';
  end if;

  v_window := make_interval(secs => p_window_ms / 1000.0);

  return query
  insert into public.rate_limit_windows as w (key_hash, hit_count, reset_at)
  values (p_key_hash, 1, p_now + v_window)
  on conflict (key_hash) do update
    set hit_count = case when w.reset_at <= p_now then 1 else w.hit_count + 1 end,
        reset_at  = case when w.reset_at <= p_now then p_now + v_window else w.reset_at end
  returning w.hit_count, w.reset_at;
end;
$$;

-- Deletes up to `p_limit` windows that expired at or before `p_now`.
--
-- `skip locked` keeps this out of the way of `rate_limit_consume`: a row a
-- request is currently updating is simply left for a later prune rather
-- than contended for. The outer `reset_at <= p_now` re-check is deliberate.
-- Between selecting a candidate and deleting it, a consume may have reset
-- that window into the future; the row lock prevents that interleaving in
-- practice, and the re-check makes the guarantee explicit rather than a
-- property of lock timing.
create function rate_limit_prune(p_now timestamptz, p_limit integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_limit is null or p_limit <= 0 then
    raise exception 'rate_limit_prune: limit must be positive' using errcode = '22023';
  end if;

  delete from public.rate_limit_windows w
  where w.key_hash in (
      select c.key_hash
      from public.rate_limit_windows c
      where c.reset_at <= p_now
      limit p_limit
      for update skip locked
    )
    and w.reset_at <= p_now;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function rate_limit_consume(text, integer, timestamptz) from public;
revoke execute on function rate_limit_prune(timestamptz, integer) from public;
grant execute on function rate_limit_consume(text, integer, timestamptz) to service_role;
grant execute on function rate_limit_prune(timestamptz, integer) to service_role;
