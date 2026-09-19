# Core Web Vitals field telemetry

Closes engineering item 6 of Step 45's punch list
(`cladium-research/operations/production-readiness-decision.md`, D-049):
**"Capture real P75 field telemetry once meaningful staging/production
traffic exists."** Step 41 measured Core Web Vitals locally and was careful
to label those numbers a proxy; Gate 7 asks for real field numbers, and
until this feature existed there was no mechanism to produce any.

This document is what an operator needs: what a sample contains, how to turn
collection on, how to read the numbers, and when a number is not yet worth
quoting.

## Status

Collection is **off**. `FEATURE_FIELD_TELEMETRY` defaults to `false` and is
set to `false` in `.env.example`; nothing is collected in any environment
until the owner sets it to `true` on that environment. Shipping this code
therefore does not start measuring anything.

This closes the _mechanism_ half of item 6. The item is only fully closed
once the flag has been on long enough, against real traffic, to produce a
percentile over at least `MIN_MEANINGFUL_SAMPLE_COUNT` samples — see
"When a P75 is worth quoting" below.

## What a sample contains

Eight fields, all of them either a closed set or a bounded number:

| Field             | Values                                                                             |
| ----------------- | ---------------------------------------------------------------------------------- |
| `metric`          | `LCP`, `INP`, `CLS`, `TTFB`, `FCP`                                                 |
| `value`           | milliseconds (a unitless ratio for `CLS`), 0–600000                                |
| `rating`          | `good`, `needs-improvement`, `poor`                                                |
| `navigation_type` | `navigate`, `reload`, `prerender`, `back-forward`, `back-forward-cache`, `restore` |
| `route_pattern`   | `home`, `menu`, `book`, `event`, `visit`, `concierge`, `privacy`, `other`          |
| `locale`          | `en`, `ur`                                                                         |
| `viewport_bucket` | `mobile` (<768), `tablet` (768–1023), `desktop` (≥1024)                            |
| `recorded_at`     | server timestamp                                                                   |

## What a sample does not contain

No session id, no customer id, no IP address, no user agent, no URL, and no
free text of any kind. A row cannot be traced to a guest, joined to a
request, or used to reconstruct a browsing history.

That is enforced in three places rather than assumed:

1. **The browser sends only a pathname and a viewport width.** Not a full
   URL, not a session token.
2. **The server throws both away before storage.** `resolveRoutePattern`
   reduces the pathname to one of eight tokens and `resolveViewportBucket`
   reduces the width to one of three buckets
   (`src/modules/telemetry/vitals-sample.ts`). Neither raw value is ever
   written.
3. **The schema refuses anything else.** `reportVitalsBodySchema` is a strict
   object, so an extra field is a validation error rather than something
   silently ignored on its way to the table.

### Why this is not a new consent category

`src/modules/consent/policy.ts` defines four categories
(`ESSENTIAL_PREFERENCES`, `META_MARKETING`, `MICROPHONE`, `RECORDING`), each
with owner-facing wording. Adding a fifth would mean inventing privacy copy,
which `CLAUDE.md` forbids ("Never publish placeholder legal pages,
promotions, reviews...").

The design answer is to make the data genuinely non-personal instead, and to
put the decision about _when measurement runs_ behind a server flag the owner
controls. If a future change would attach anything identifying to a sample —
a session id, an IP, a referrer — that stops being true and the change needs
owner-reviewed consent wording first, not a code review.

Relatedly, the collection endpoint deliberately does **not** mint a guest
session cookie, which is why it does not use the shared
`parseMutatingRequest`/CSRF helper every other guest-mutating route uses.
`src/app/api/telemetry/vitals/route.ts` documents that trade-off in full,
including what its origin check does and does not protect against.

## Turning collection on

1. Set `FEATURE_FIELD_TELEMETRY=true` on the Vercel environment.
2. Redeploy with a **fresh build**, not a cache-reusing "Redeploy" — a
   changed environment variable affecting request-time behavior is not
   guaranteed to be re-baked otherwise. This is the same gotcha D-047's
   staging release hit with `403 FORBIDDEN` on every mutation.
3. Confirm the reporter is present: load `/en`, and the browser should POST
   to `/api/telemetry/vitals` (202, empty body) as metrics finalize. With the
   flag off the component is not rendered at all, so there is nothing to see.

Nothing else needs configuring. Storage uses the same Supabase credentials
every other table does; with none configured the store silently falls back to
in-memory (a warn is logged), which is correct for local development and
useless for real measurement.

## Reading the numbers

`GET /api/staff/telemetry/vitals?days=28` — staff-authenticated, readable by
any signed-in staff member. Returns:

- `overall` — one row per metric, site-wide.
- `byRoute` — one row per metric × route × viewport.
- Each row carries `sampleCount`, `p75`, and `meaningful`.

`days` defaults to 28 and is capped at the retention window (90); a longer
range would silently describe a shorter one.

Percentiles are computed by Postgres (`web_vitals_p75`,
`web_vitals_p75_overall`, migration `20260919120000`) using
`percentile_cont(0.75)` — the interpolating variant, which is what "P75"
normally means for a duration. The raw rows are not readable through RLS at
all; the aggregate functions are this table's only read interface, so it is
not possible to accidentally build a per-visitor view out of data collected
on the promise of being aggregate.

The site-wide number is its own SQL function rather than a re-aggregation of
the per-route rows, because a percentile of percentiles is not a percentile.

## When a P75 is worth quoting

`MIN_MEANINGFUL_SAMPLE_COUNT` is **100**, and every API row reports
`meaningful` against it.

A "P75" over four page loads is describing four page loads. Quoting one in
the readiness report would repeat exactly the overstatement Step 41 was
careful to avoid — that report said plainly that its numbers were a local
proxy, and the fix for that is real data, not a thinner veneer over a small
sample. Below the threshold, report the sample count and say measurement is
still accumulating.

Good-threshold reference values, for interpreting a `rating` distribution:
LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 (the standard Core Web Vitals "good"
bounds, which is what `next/web-vitals` itself uses to assign `rating`).

## Retention

`GET /api/cron/telemetry-retention` with `Authorization: Bearer $CRON_SECRET`
prunes samples older than `VITALS_SAMPLE_RETENTION_DAYS` (90). Same
authenticated-job pattern as `/api/cron/consent-retention`.

This is the highest-volume insert in the schema — one row per metric per page
load — and the Supabase plan is currently the free one, so the schedule
matters operationally. Vercel Hobby's once-daily cron minimum is ample for a
90-day window (unlike the outbox dispatcher, which needed an external
scheduler; see `outbox-dispatch-cron.md`).

Unlike consent-event retention, this window is an operational storage choice,
not a compliance commitment: the rows are anonymous, so it may be shortened
_or_ lengthened without owner/legal review.

## What this does not do

- **No alerting.** Item 8 of the same punch list — wiring live alerting to
  the thresholds proposed in `performance-resilience-report.md` — is still
  open. A store fallback or an insert failure logs a `warn` and nothing
  watches it yet.
- **No dashboard UI.** The staff API returns JSON; nothing renders it.
- **No lab/CI budget enforcement.** This measures the field, it does not gate
  a deploy on a Lighthouse score.
