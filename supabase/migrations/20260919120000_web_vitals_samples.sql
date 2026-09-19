-- Real P75 field telemetry (LCP/INP/CLS) — closes engineering item 6 of
-- Step 45's punch list (`production-readiness-decision.md`, D-049), which
-- had been open since Step 41 produced only a *local* Core Web Vitals
-- proxy. Gate 7 asks for real field numbers; nothing in this codebase has
-- ever captured a measurement from a real guest's device.
--
-- Purely additive: one new table, one index, its policies, its grants, and
-- two read-only functions. No existing table, column, constraint, policy,
-- function, or row is altered or dropped, so there is nothing destructive
-- to stage across releases and nothing to restore on rollback beyond
-- dropping what this file creates.
--
-- ## Why a table, and not a log line
--
-- A P75 is a percentile over a population, so the population has to exist
-- somewhere queryable. Vercel's Hobby plan (still the current plan — see
-- `.continuum/PROJECT_STATE.md`) retains runtime logs for about an hour,
-- which is far too short to compute a meaningful P75 over, and log-derived
-- percentiles would also mean parsing prose back into numbers. Storing one
-- narrow row per sample and letting Postgres compute `percentile_cont` is
-- both cheaper and exact.
--
-- ## This table is deliberately anonymous, and that is a design constraint
--
-- There is no session id, no customer id, no IP address, no user agent, no
-- URL, and no free text of any kind. A row cannot be traced back to a
-- guest, joined to a request, or used to reconstruct a browsing history:
--
--   * `route_pattern` is a bounded enum-like token (`home`, `menu`, `book`,
--     ... `other`) resolved server-side from an allowlist — never the raw
--     pathname, never a query string. Cardinality is fixed by code, so an
--     attacker cannot use it as a free-text channel.
--   * `viewport_bucket` is one of three coarse buckets, derived
--     server-side from a reported width. The raw width never lands here —
--     it is a (small) fingerprinting surface and is not needed to answer
--     "is mobile slower than desktop".
--   * `locale` is already public in the URL of every page on this site.
--
-- That anonymity is what makes this measurement *not* a new consent
-- category. `modules/consent/policy.ts` defines exactly four categories
-- (`ESSENTIAL_PREFERENCES`, `META_MARKETING`, `MICROPHONE`, `RECORDING`),
-- each with owner-facing wording; adding a fifth would mean inventing
-- privacy copy, which `CLAUDE.md` forbids ("Never publish placeholder
-- legal pages"). Instead, collection is gated on a server feature flag
-- (`FEATURE_FIELD_TELEMETRY`, default off) so the owner decides when it
-- runs, and the payload is kept genuinely non-personal so that decision is
-- about measurement cost, not about guest privacy.
--
-- ## No `version` column, no `updated_at`, no trigger
--
-- Unlike every request/notification table in this schema, a sample is an
-- immutable observation: it is inserted once and never updated, so the
-- optimistic-concurrency `version` column and the `set_row_updated()`
-- trigger every mutable table carries would be dead weight here. The
-- append-only posture is enforced below by granting no `update` to anyone.

create table web_vitals_samples (
  id uuid primary key default gen_random_uuid(),

  -- The five metrics `next/web-vitals` reports. Constrained rather than
  -- free text so a malformed or invented metric name cannot enter the
  -- table and silently skew a percentile.
  metric text not null
    constraint web_vitals_samples_metric_allowed
      check (metric in ('LCP', 'INP', 'CLS', 'TTFB', 'FCP')),

  -- Milliseconds for every metric except CLS, which is a unitless ratio.
  -- Both are non-negative; the upper bound exists so a hostile or broken
  -- client cannot poison a percentile with an absurd outlier. 600000ms
  -- (10 minutes) is far beyond any real LCP/TTFB while still leaving
  -- genuinely terrible real-world measurements intact.
  value double precision not null
    constraint web_vitals_samples_value_sane
      check (value >= 0 and value <= 600000),

  rating text not null
    constraint web_vitals_samples_rating_allowed
      check (rating in ('good', 'needs-improvement', 'poor')),

  navigation_type text not null
    constraint web_vitals_samples_navigation_type_allowed
      check (navigation_type in (
        'navigate', 'reload', 'prerender',
        'back-forward', 'back-forward-cache', 'restore'
      )),

  -- Bounded server-resolved token, never a raw path. See the header.
  route_pattern text not null
    constraint web_vitals_samples_route_pattern_allowed
      check (route_pattern in (
        'home', 'menu', 'book', 'event', 'visit', 'concierge', 'privacy', 'other'
      )),

  locale text not null
    constraint web_vitals_samples_locale_allowed
      check (locale in ('en', 'ur')),

  viewport_bucket text not null
    constraint web_vitals_samples_viewport_bucket_allowed
      check (viewport_bucket in ('mobile', 'tablet', 'desktop')),

  recorded_at timestamptz not null default now()
);

comment on table web_vitals_samples is
  'Anonymous Core Web Vitals field samples. No session, IP, user agent, or URL — see the migration header for why that is a design constraint, not an omission.';

comment on column web_vitals_samples.value is
  'Milliseconds, except CLS which is a unitless ratio. Bounded by check constraint so one hostile client cannot poison a percentile.';

comment on column web_vitals_samples.route_pattern is
  'Server-resolved allowlist token (never the raw pathname), so cardinality is fixed by code and cannot carry free text.';

-- Every query this table exists for is "one metric, recent window,
-- optionally sliced by route/viewport" — `web_vitals_p75` below is exactly
-- that shape. Leading on `recorded_at desc` lets the retention job's range
-- delete use the same index.
create index web_vitals_samples_metric_recent_idx
  on web_vitals_samples (metric, recorded_at desc)
  include (route_pattern, viewport_bucket, locale, value);

-- ------------------------------------------------------------------ RLS ---
alter table web_vitals_samples enable row level security;

-- Staff may read the aggregate functions below, but nobody reads raw rows
-- through RLS: there is deliberately NO select policy at all. Percentiles
-- are the product here, and a row-level read adds nothing an operator
-- needs while making it easier to accidentally build a per-visitor view
-- out of data that was collected on the promise of being aggregate.
--
-- There is likewise no insert policy. Samples are written by the API route
-- through the service role (which bypasses RLS), the same worker-owned
-- posture `outbox_events`, `webhook_events`, and `staff_notifications`
-- already use. A guest reaches Postgres only through the anon key, so with
-- no anon policy and no anon grant there are two independent layers
-- between a guest and this table — even though it is a guest's browser
-- that ultimately causes the insert.

-- `20260830044140_fix_default_table_privileges.sql` revokes the platform's
-- automatic grants for every future table, service_role included, so each
-- role must be named explicitly here or the first insert fails with 42501
-- at runtime rather than at deploy time.
--
-- No `update` for anyone, including service_role: a sample is an immutable
-- observation, and the schema should say so rather than relying on the
-- application never issuing one. `delete` is granted only so the retention
-- job can prune old rows.
grant select, insert, delete on web_vitals_samples to service_role;

-- --------------------------------------------------------- aggregation ---
-- `percentile_cont` is the interpolating variant, which is what "P75" is
-- normally taken to mean for a continuous measure like a duration (the
-- discrete `percentile_disc` would snap to an actually-observed sample).
--
-- `sample_count` is returned alongside every percentile on purpose: a P75
-- over four page loads is not a field measurement, and an operator reading
-- these numbers needs to see that immediately rather than discovering it
-- later. `docs/field-telemetry.md` records the minimum sample count this
-- project treats as meaningful.
--
-- `security invoker` (the default, stated explicitly for the reader) plus
-- `set search_path = ''` and schema-qualified relations — the same posture
-- 20260905030000 established for every function in this schema after
-- Supabase's own advisor flagged mutable search paths.
create or replace function web_vitals_p75(p_since timestamptz)
returns table (
  metric text,
  route_pattern text,
  viewport_bucket text,
  sample_count bigint,
  p75 double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.metric,
    s.route_pattern,
    s.viewport_bucket,
    count(*) as sample_count,
    percentile_cont(0.75) within group (order by s.value) as p75
  from public.web_vitals_samples as s
  where s.recorded_at >= p_since
  group by s.metric, s.route_pattern, s.viewport_bucket
  order by s.metric, s.route_pattern, s.viewport_bucket
$$;

comment on function web_vitals_p75(timestamptz) is
  'P75 per metric/route/viewport since a cutoff, with the sample count each percentile is computed over.';

-- The same percentile collapsed across routes and viewports — the
-- site-wide headline number Gate 7 actually asks for ("real P75 field
-- telemetry"). Kept as its own function rather than making callers
-- re-aggregate `web_vitals_p75`'s output, because a percentile of
-- percentiles is not a percentile.
create or replace function web_vitals_p75_overall(p_since timestamptz)
returns table (
  metric text,
  sample_count bigint,
  p75 double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.metric,
    count(*) as sample_count,
    percentile_cont(0.75) within group (order by s.value) as p75
  from public.web_vitals_samples as s
  where s.recorded_at >= p_since
  group by s.metric
  order by s.metric
$$;

comment on function web_vitals_p75_overall(timestamptz) is
  'Site-wide P75 per metric since a cutoff. Separate from web_vitals_p75 because a percentile of percentiles is not a percentile.';

-- Both functions are `security invoker` and RLS exposes no rows to `anon`
-- or `authenticated`, so an execute grant alone reveals nothing: the
-- service role is what actually reads, on behalf of an authenticated staff
-- caller the application has already checked. PUBLIC is revoked for the
-- same reason every other function in this schema revokes it.
revoke all on function web_vitals_p75(timestamptz) from public;
revoke all on function web_vitals_p75_overall(timestamptz) from public;
grant execute on function web_vitals_p75(timestamptz) to service_role;
grant execute on function web_vitals_p75_overall(timestamptz) to service_role;
