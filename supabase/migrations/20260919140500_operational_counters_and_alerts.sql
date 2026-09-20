-- Real alerting against Step 41's proposed thresholds — engineering item 8
-- of Step 45's punch list (`production-readiness-decision.md`, D-049).
--
-- `performance-resilience-report.md` proposed four alert thresholds and was
-- explicit that "no live monitoring/alerting stack exists yet". Three of the
-- four had no signal to read at all:
--
--   * outbox terminal-failure rate  → already derivable from `outbox_events`
--   * rate-limit rejection rate     → `rate_limit_windows` keeps only the
--                                     *current* window, keyed by a SHA-256
--                                     hash, so neither rejections nor the
--                                     route they belong to are recoverable
--   * provider timeout rate         → logged only
--   * concierge deadline-hit rate   → nothing persisted
--
-- This migration adds the missing signal and the firing record. Purely
-- additive: two new tables and two functions, no change to any existing
-- table, column, constraint, policy, function, or row.
--
-- ## Counters, not event rows
--
-- Every threshold is a *rate over a window*, which needs a numerator and a
-- denominator — so both outcomes have to be recorded, not just the bad one.
-- Storing one row per occurrence would mean a row for every guest mutation
-- and every provider call, on a free-tier database.
--
-- Instead this is a minute-bucketed counter: one upsert per occurrence, and
-- the table's size is bounded by (kinds × labels × outcomes × minutes)
-- rather than by traffic. A rolling window is a sum over buckets, which is
-- exactly the shape the thresholds are written in. The cost is losing
-- sub-minute ordering and per-occurrence detail — neither of which any
-- threshold asks for, and correlation ids for individual failures already
-- live in the structured logs.
--
-- ## These rows are anonymous, like `web_vitals_samples`
--
-- No session, customer, IP, user agent, or free text. `label` is a bounded
-- token resolved server-side from an allowlist (a route's rate-limit key
-- prefix, or a provider name), never a caller-supplied string — the same
-- constraint, and for the same reason, as `web_vitals_samples.route_pattern`.

create table operational_counters (
  -- Truncated to the minute by `operational_counter_increment` — never by
  -- the caller, so bucket alignment cannot drift between call sites.
  bucket_minute timestamptz not null,

  kind text not null
    constraint operational_counters_kind_allowed
      check (kind in ('rate_limit', 'provider_call', 'concierge_turn')),

  -- Bounded server-side token: a rate-limit key prefix (`req-submit`,
  -- `cart-item`, …) or a provider name (`vapi_tool`, `meta_event`).
  -- Constrained in shape rather than by an exhaustive list, because the set
  -- grows with routes; `src/modules/alerting/operational-event.ts` holds the
  -- actual allowlist, and nothing else may construct one.
  label text not null
    constraint operational_counters_label_format
      check (label ~ '^[a-z][a-z0-9_-]{0,39}$'),

  -- `ok` is the denominator, `rejected`/`timeout` the numerators. Recording
  -- `ok` is what makes a *rate* possible rather than a raw count that says
  -- nothing about whether traffic doubled.
  outcome text not null
    constraint operational_counters_outcome_allowed
      check (outcome in ('ok', 'rejected', 'timeout')),

  count integer not null default 0
    constraint operational_counters_count_non_negative check (count >= 0),

  primary key (bucket_minute, kind, label, outcome)
);

comment on table operational_counters is
  'Minute-bucketed operational outcome counters feeding the alert thresholds. Anonymous: no session, IP, user agent, or free text.';

comment on column operational_counters.outcome is
  'ok is the denominator; rejected/timeout are numerators. Both are recorded so a threshold measures a rate, not a raw count.';

-- Every read is "this kind, since this cutoff"; the retention delete uses
-- the same leading column.
create index operational_counters_recent_idx
  on operational_counters (bucket_minute desc, kind);

-- One fired alert. Kept append-only for the same reason status history is:
-- "did we alert, on what evidence, and when" must stay answerable after the
-- condition clears.
create table alert_firings (
  id uuid primary key default gen_random_uuid(),

  -- Stable identifier of the threshold that fired, e.g.
  -- `outbox_terminal_failure_rate`. Matches `ALERT_THRESHOLDS`' keys.
  alert_key text not null
    constraint alert_firings_key_format check (alert_key ~ '^[a-z][a-z0-9_]{0,63}$'),

  -- The evidence, stored so an operator can judge the alert without
  -- re-running the query, and so a later threshold change does not silently
  -- rewrite the history of why something fired.
  window_seconds integer not null
    constraint alert_firings_window_positive check (window_seconds > 0),
  numerator integer not null
    constraint alert_firings_numerator_non_negative check (numerator >= 0),
  denominator integer not null
    constraint alert_firings_denominator_positive check (denominator > 0),
  observed_rate double precision not null
    constraint alert_firings_observed_rate_range
      check (observed_rate >= 0 and observed_rate <= 1),
  threshold_rate double precision not null
    constraint alert_firings_threshold_rate_range
      check (threshold_rate >= 0 and threshold_rate <= 1),

  fired_at timestamptz not null default now()
);

comment on table alert_firings is
  'Append-only record of fired alerts and the evidence each fired on. Doubles as the cooldown source: a threshold does not re-fire while a recent firing exists.';

-- The cooldown lookup is "most recent firing of this key", which this index
-- answers directly.
create index alert_firings_key_recent_idx on alert_firings (alert_key, fired_at desc);

-- ------------------------------------------------------------------ RLS ---
-- Both tables are worker-owned, the same posture as `outbox_events`,
-- `webhook_events`, `rate_limit_windows` and `web_vitals_samples`: written
-- by the application through the service role, which bypasses RLS, and no
-- policy for anyone else. A guest reaches Postgres only through the anon
-- key, so with no policy and no grant there are two independent layers
-- between them and these tables.
--
-- Staff do not read these directly either — a fired alert reaches them as a
-- `staff_notifications` row through the existing outbox, which is already
-- readable by signed-in staff. That keeps one notification surface rather
-- than two.
alter table operational_counters enable row level security;
alter table alert_firings enable row level security;

-- `20260830044140_fix_default_table_privileges.sql` only revokes
-- SELECT/INSERT/UPDATE/DELETE from the platform defaults, so a new table
-- still inherits REFERENCES/TRIGGER/TRUNCATE for `anon` and `authenticated`
-- — the gap `20260906130500` hit on `staff_notifications` and
-- `20260919123000` hit again on `web_vitals_samples`. Revoking up front here
-- rather than discovering it a third time afterwards. (The root cause, the
-- narrow ALTER DEFAULT PRIVILEGES list, is tracked as a P1 in
-- `.continuum/TASKS.md` and is deliberately not widened in this migration.)
revoke all on operational_counters from anon, authenticated;
revoke all on alert_firings from anon, authenticated;

grant select, insert, update, delete on operational_counters to service_role;
grant select, insert, delete on alert_firings to service_role;

-- ------------------------------------------------------------- functions ---
-- One statement, no read-then-write: the increment must be atomic because
-- every serverless instance handling a request calls it concurrently for the
-- same bucket. `date_trunc` inside the function is what guarantees callers
-- cannot disagree about bucket boundaries.
create or replace function operational_counter_increment(
  p_kind text,
  p_label text,
  p_outcome text,
  p_now timestamptz
) returns void
language sql
set search_path = ''
as $$
  insert into public.operational_counters as c (bucket_minute, kind, label, outcome, count)
  values (date_trunc('minute', p_now), p_kind, p_label, p_outcome, 1)
  on conflict (bucket_minute, kind, label, outcome)
  do update set count = c.count + 1
$$;

comment on function operational_counter_increment(text, text, text, timestamptz) is
  'Atomically increments one minute bucket. Truncates to the minute itself so concurrent callers cannot disagree about bucket boundaries.';

-- Numerator/denominator per (kind, label) over a window. Returns
-- `ok`-outcome rows as the denominator component and everything else as the
-- numerator, leaving the ratio to the caller: the threshold definitions live
-- in TypeScript (`modules/alerting/thresholds.ts`), and splitting the
-- arithmetic across two languages is how the two drift apart.
create or replace function operational_counter_totals(p_since timestamptz)
returns table (
  kind text,
  label text,
  ok_count bigint,
  bad_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    c.kind,
    c.label,
    coalesce(sum(c.count) filter (where c.outcome = 'ok'), 0) as ok_count,
    coalesce(sum(c.count) filter (where c.outcome <> 'ok'), 0) as bad_count
  from public.operational_counters as c
  where c.bucket_minute >= date_trunc('minute', p_since)
  group by c.kind, c.label
$$;

comment on function operational_counter_totals(timestamptz) is
  'Per kind/label ok vs not-ok totals since a cutoff. Returns the two counts, not a ratio: the thresholds themselves live in TypeScript.';

revoke all on function operational_counter_increment(text, text, text, timestamptz) from public;
revoke all on function operational_counter_totals(timestamptz) from public;
grant execute on function operational_counter_increment(text, text, text, timestamptz) to service_role;
grant execute on function operational_counter_totals(timestamptz) to service_role;
