# Operational alerting

Closes engineering item 8 of Step 45's punch list
(`cladium-research/operations/production-readiness-decision.md`, D-049):
**"Build and wire real alerting against Step 41's proposed thresholds."**

Step 41 proposed four thresholds and said plainly that "no live
monitoring/alerting stack exists yet". Three of the four had no signal to read
at all. This is what was built, what it can and cannot tell you, and what it
still needs from you.

## The four thresholds

Transcribed verbatim from `performance-resilience-report.md` into
`src/modules/alerting/thresholds.ts`.

| Key                            | Fires above | Window | Floor |
| ------------------------------ | ----------- | ------ | ----- |
| `outbox_terminal_failure_rate` | 1%          | 1 hour | 20    |
| `rate_limit_rejection_rate`    | 5%          | 5 min  | 20    |
| `provider_timeout_rate`        | 10%         | 15 min | 10    |
| `concierge_deadline_hit_rate`  | 5%          | 15 min | 10    |

**These are not an owner-approved SLA.** Step 41 called them
"engineering-judgment proposals", and nothing has changed that. Revising them
means editing those numbers and nothing else.

The report's fifth proposal — staff-transition version conflicts — is
deliberately absent. It said "track for visibility only, do not alert", and
an alert that fires on healthy behavior teaches people to ignore alerts.

**"Floor" is not from the report.** Every threshold also requires a minimum
denominator before it can fire. One rejection out of two is a 50% rate, and at
3am two requests is a normal five minutes; without a floor the first alert
this system ever sent would almost certainly have been spurious.

The `concierge_deadline_hit_rate` window is the one number not in the report —
it gave a rate but no window, so it takes the same 15 minutes as the other
provider-degradation signal. Recorded here rather than silently chosen.

## Where the numbers come from

`outbox_terminal_failure_rate` reads `outbox_events` directly — it was already
the source of truth for its own state, and counting it twice would create two
records free to disagree.

The other three had nothing. `rate_limit_windows` keeps only the _current_
window, keyed by a SHA-256 hash, so neither rejections nor the route they
belong to were recoverable; provider timeouts and concierge deadline hits were
logged and forgotten. They now increment `operational_counters`, a
minute-bucketed table written at these sites:

- `lib/http/mutating-route.ts` — every guest route going through
  `parseMutatingRequest` (cart, review, submit, consent, Meta tracking)
- `app/api/telemetry/vitals/route.ts` — which bypasses that helper
- `modules/concierge/orchestrator.ts` — the chat rate limit, and whether the
  turn hit `TURN_TIMEOUT_MS`
- `modules/voice/tools/execute-vapi-tool-calls.ts` and
  `modules/integrations/meta-events.ts` — provider timeouts

Both outcomes are counted, not just the bad one: a rejection count alone
cannot tell "abuse" from "twice as many guests".

Counters, not one row per event, because every threshold is a rate over a
window and a per-occurrence table would mean a row for every guest mutation on
a free-tier database. The cost is losing sub-minute ordering and
per-occurrence detail; no threshold asks for either, and correlation ids for
individual failures are already in the structured logs.

Rows are anonymous — no session, IP, user agent, or free text. `label` is a
server-side allowlist token (`src/modules/alerting/operational-event.ts`),
which bounds cardinality _and_ prevents a typo from silently splitting one
rate's denominator into two populations.

## Where a fired alert goes

Into the existing outbox, as an event with destination `staff_notification` —
the same pipeline that already delivers new bookings. Staff see alerts in
`/staff` alongside real requests, and the alert inherits that pipeline's
durability, retry, and terminal-failure handling rather than reinventing them.

**The honest limit: this is a dashboard someone has to open. Nobody is paged
at 3am.** An outbound webhook adapter is the obvious next step and is
deliberately not built — it needs an endpoint you supply, and inventing one
would be the kind of unapproved integration `CLAUDE.md` gates.

One notification per threshold per run, describing the _worst_ breach. Three
routes breaching at once is one incident; the count of the others is logged as
`alerting.threshold.additional_breaches`. A 30-minute cooldown
(`ALERT_COOLDOWN_SECONDS`) then keeps a persisting condition from re-notifying
every run — a systemic bug lasts longer than one cron interval, and burying
the staff queue under copies of one incident costs more than it tells anyone.

`alert_firings` keeps every firing and the evidence it fired on, append-only,
and is never pruned: it is small, and it is what you want when working out why
nobody noticed something.

## Running it

Two authenticated jobs, both `Authorization: Bearer $CRON_SECRET`:

- `GET /api/cron/alerts` — evaluate and notify.
- `GET /api/cron/alerting-retention` — prune counters older than
  `OPERATIONAL_COUNTER_RETENTION_DAYS` (14).

**Cadence is load-bearing for the first one.** The shortest window is 5
minutes, so evaluating less often than that means a rate-limit incident can
open and close entirely between two runs and never be seen. Vercel Hobby's
cron minimum is **once daily**, which is useless here — so, exactly like the
outbox dispatcher, this needs an external scheduler calling it every few
minutes until the plan changes. See `outbox-dispatch-cron.md` for the pattern
already in use.

Until that scheduler exists, nothing evaluates and nothing alerts. The code
being merged is not the same as the alerting being on.

## If alerts go quiet, check this first

`alerting.store.postgres_unavailable_using_in_memory` in the logs.

With no Supabase client the store falls back to a per-process `Map`. Counters
then live in one instance's heap, so every instance computes a rate over its
own slice of traffic and a real incident spread across instances can sit under
the threshold everywhere and alert nowhere. That is a monitoring system
reporting healthy while the thing it monitors is broken — worse than no
monitoring, because it is trusted.

Nothing alerts on that warning, which is the obvious gap and is stated here
rather than left to be discovered. Watching it is what a real monitoring
vendor would be for.

## What this does not do

- **No paging.** See above.
- **No dashboard.** Alerts arrive as staff notifications; there is no page
  charting rates over time.
- **No anomaly detection.** Fixed thresholds only — nothing learns what normal
  looks like.
- **Two thresholds will read zero for now.** `provider_timeout_rate` counts
  Vapi and Meta calls, and both features are flag-gated off entirely, so there
  is nothing to time out. Correct, not broken — the floor suppresses them as
  `insufficient_data` rather than reporting a reassuring 0%.
