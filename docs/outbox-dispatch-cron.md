# Outbox dispatch scheduling

The transactional outbox only delivers if something drains it. The store is
durable (`outbox_events` in Postgres), and `GET /api/cron/outbox-dispatch`
runs one bounded dispatch cycle — but **nothing invokes it on a schedule
from inside this repository**. That is deliberate, and this document says
what has to exist outside it.

> **Status, 11 Sep 2026 — production notification delivery remains unproven.**
> The scheduler described below was reported as configured, but nothing
> observable supports it working: no `rpc/outbox_claim_batch` call has been
> observed in the retained edge logs, and `staff_notifications` has `n_tup_ins = 0`
> and no delivery has been demonstrated. Retention is finite and the counter
> resets, so both are bounded observations, not statements about all time.
>
> Scope that carefully — `pg_stat_database.stats_reset` for this database is
> **2026-08-25 20:41:21Z**, so the insert counter describes activity since
> then rather than for all time, and statistics can be reset. The window does
> contain all six known production submissions (5–6 Sep), so the absence is
> meaningful; it is not a lifetime claim.
>
> This document describes a contract, not a running system. `docs/outbox-scheduler-setup.md`
> plans a reviewable job; this file records what the caller must satisfy.
> `docs/takeaway-release-plan.md` §5 has the diagnostic procedure and the
> delivery test that must pass — and note that an HTTP `200` from the dispatch
> route proves a cycle ran, not that any notification was delivered.

## Why not Vercel Cron

This project is on the **Vercel Hobby** plan, which restricts cron jobs to a
once-daily schedule. A day of latency on "a guest requested a table" is not
a notification; it is a missed booking. A `crons` entry with a sub-daily
expression is also rejected at deploy time on Hobby, so committing one would
break deployments on a live site.

`vercel.json` therefore carries **no `crons` entry**, and production dispatch
is driven by an **external scheduler** calling the endpoint over HTTPS. If
the project later moves to Vercel Pro, the same endpoint and the same secret
work unchanged — the scheduler simply becomes a `crons` entry instead.

### Which scheduler — unrecorded, and that is now a problem

**No scheduler service is named anywhere in this repository.** This document
specifies the _contract_ a scheduler must satisfy; it never records which
product was chosen, under which account, or with what job id. Searched
11 Sep 2026 across `docs/`, `.continuum/` and `cladium-research/`: no
reference to any scheduling service exists, and `.github/workflows/` contains
no `schedule:` trigger, so nothing inside the repository is calling it
either.

The only evidence a scheduler was ever created is a **verbal report from the
owner** (`TASKS.md`: "stale since the owner reported configuring an external
scheduler"). D-088 is explicit that the commit which added this endpoint did
not activate anything: _"Not activated by this commit alone. Delivery starts
only once an external scheduler is calling the endpoint."_

That absence changes the diagnosis. The three candidate causes on record —
not firing, `401`, in-memory fallback — all presuppose a configured job that
is misbehaving. Two more fit the evidence equally well and were never listed:

- **No job was ever created**, the intent having been recorded here but not
  carried out.
- **A job was created and has since stopped.** Free scheduling tiers commonly
  auto-disable a job after a run of consecutive failures. If the secret was
  wrong from the start, every call would have returned `401`, and the service
  would have switched the job off by itself — which looks identical, from
  Supabase, to a job that never existed.

**Whoever configured it needs to name the service.** Until the job can be
found and its execution history read, the pipeline cannot be diagnosed from
this side at all, and any record of it should be written down here so the
next person does not have to ask.

## The exact request the scheduler must make

| Field             | Value                                                      |
| ----------------- | ---------------------------------------------------------- |
| Method            | `GET`                                                      |
| URL               | `https://cladium-cafe.vercel.app/api/cron/outbox-dispatch` |
| Header            | `Authorization: Bearer <CRON_SECRET>`                      |
| Cadence           | every 5 minutes                                            |
| Expected response | `200` with a JSON summary of counts                        |

`<CRON_SECRET>` is the value of the `CRON_SECRET` environment variable set on
the Vercel project. It is a server-only secret: it must never appear in this
repository, in a commit, in logs, in a screenshot, or in a test fixture, and
must never be exposed as a `NEXT_PUBLIC_*` variable. Configure it directly in
the scheduler's own secret/header field.

Five minutes is chosen to match `runDispatchCycle`'s default `staleClaimMs`
of five minutes, so a row abandoned by an instance that died mid-dispatch
becomes reclaimable at about the rate the next run arrives. Each run claims
at most `limit` (default 20) rows, giving a ceiling near 240
notifications/hour; raise the cadence before the batch size if that ever
becomes the constraint.

## Verifying it is actually running

`verifyCronAuthHeader` **fails closed**: if `CRON_SECRET` is unset on the
project, or the scheduler sends the wrong value, every invocation is
rejected with `401` and the job silently never runs. An unset secret and a
wrong secret are indistinguishable from outside — both return `401` — so
confirm success positively rather than assuming it:

- A correctly authenticated call returns `200` with a JSON summary, not `401`.
- After a real booking, `outbox_events` should show the row reaching
  `DELIVERED` within a cycle or two. A table that stays empty means requests
  are not producing rows; rows stuck at `PENDING` with a rising
  `attempt_count` mean the handler is failing; rows stuck at `PENDING` with
  `attempt_count` at zero mean nothing is calling the endpoint.

## Why the endpoint is safe to expose to a scheduler

- **Authenticated.** Bearer token compared in constant time
  (`lib/security/cron-auth.ts`), rejecting anything unsigned. It is not a
  publicly triggerable dispatcher.
- **Overlap-safe.** `outbox_claim_batch` selects candidate ids
  `FOR UPDATE SKIP LOCKED` and materialises them before updating, so two
  concurrent runs cannot claim the same row, and neither exceeds `p_limit`
  (the correctness fix in `20260905020000_fix_outbox_claim_batch_limit.sql`).
  A scheduler that fires twice, or overlaps a slow run, is safe.
- **Idempotent at the mark step.** `markDelivered`/`markRetry`/
  `markTerminal` are compare-and-set on `version`; a late second resolver
  returns `false` instead of overwriting.
- **Never strands work.** A failed attempt returns to `PENDING` with a
  backoff, becoming terminal `FAILED` only after `maxAttempts`. Rows claimed
  by a dead worker are reclaimed once `staleClaimMs` passes.
- **Leaks nothing.** The response is redacted counts only — never event
  payloads, never guest data.

## Not a guest route

`/api/cron/*` is a job namespace. Nothing under it is linked from the site or
reachable through guest navigation, and the scheduled path is the dispatcher
only — it never touches a booking, event, or takeaway guest endpoint.
