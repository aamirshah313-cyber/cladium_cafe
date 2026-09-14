# Setting up the outbox dispatch scheduler

Written 14 Sep 2026. This is a setup plan, not a description of anything
running. It exists because the diagnostic track had stalled: no scheduler
service is named anywhere in this repository, and the available evidence
cannot establish whether a job exists. Rather than keep asking, this plans a
job that can be reviewed, configured and proven.

**What the evidence actually supports.** No `rpc/outbox_claim_batch` call has
been observed in Supabase's retained edge logs, and no notification delivery
has been demonstrated — `staff_notifications` holds no rows and its insert
counter reads zero, but that counter resets (this database's
`pg_stat_database.stats_reset` is 2026-08-25 20:41:21Z) and log retention is
finite. Neither observation reaches back indefinitely.

**What this does not establish.** That no job exists. An existing job could be
paused, disabled after repeated failures, pointed at the wrong URL, or firing
into a `401`. Step 0 below looks for one first; if it finds nothing that is
still not proof, but it is enough to justify creating one.

---

## 0. Look for an existing job first — **[OWNER]**

Before creating anything, check the places a job would live. Finding one
changes this from setup to repair, and its run history is the fastest
diagnosis available.

- Any cron/uptime service account (see §2 for the usual suspects).
- A server or workstation crontab, if one was ever used.
- Vercel → cladium-cafe → Logs, filtered to `/api/cron/outbox-dispatch`,
  widest available window, no other filters. A request arriving at all —
  `401` or `200` — proves a caller exists and identifies the fault.

If a job is found, skip to §5: its execution history answers in minutes what
the database cannot answer at all.

---

## 1. The contract the scheduler must satisfy

Read from the code, not from prior documentation.

| Field     | Value                                                          | Source                                  |
| --------- | -------------------------------------------------------------- | --------------------------------------- |
| Method    | `GET`                                                          | `app/api/cron/outbox-dispatch/route.ts` |
| URL       | `https://cladium-cafe.vercel.app/api/cron/outbox-dispatch`     | production deployment                   |
| Header    | `Authorization: Bearer <CRON_SECRET>`                          | `lib/security/cron-auth.ts`             |
| Cadence   | every 5 minutes                                                | matches `staleClaimMs` (below)          |
| Success   | `200` + `{"claimed":N,"delivered":N,"retried":N,"terminal":N}` | `DispatchCycleSummary`                  |
| Rejection | `401` + `{"error":{"code":"UNAUTHORIZED",…}}`                  | route guard                             |

Details that matter when configuring:

- **The prefix is exactly `Bearer ` with one trailing space**, compared in
  constant time against `CRON_SECRET`. A bare secret, `Basic`, a different
  header name, or stray whitespace all produce an identical `401`.
- **`CRON_SECRET` is `z.string().min(1)`** — any non-empty string. There is no
  format requirement, so a long random value is purely a security choice.
- **Five minutes matches `runDispatchCycle`'s default `staleClaimMs`**, so a
  row abandoned by an instance that died mid-dispatch becomes reclaimable at
  about the rate the next run arrives. Slower is safe but delays
  notifications; faster is safe but pointless.
- **Each cycle claims at most 20 rows** (`limit`), a ceiling near 240
  notifications/hour. Raise the cadence before the batch size if that ever
  binds.
- **Overlapping runs are safe.** `outbox_claim_batch` selects
  `FOR UPDATE SKIP LOCKED`, so two concurrent cycles cannot claim the same
  row. A scheduler that double-fires, or one whose run overruns the interval,
  causes no duplication.
- **Delivery is idempotent.** The staff-notification handler upserts keyed by
  the outbox event id, so a redelivered event updates one row rather than
  creating a second.
- **Failures retry with backoff**, becoming terminal `FAILED` only after 5
  attempts.

The response body carries counts only — never event payloads, never guest
data — so it is safe to log in a scheduler's run history.

---

## 2. Choosing a service — **[OWNER decision]**

Any service that can issue an authenticated `GET` on a schedule works. The
differences that matter here are whether custom headers are supported at all,
and whether the job is disabled after repeated failures.

| Option                                                                      | Notes                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Cron**                                                             | Simplest — no third party, same platform, `crons` entry in `vercel.json`. **Blocked on Hobby:** limited to once daily, and a sub-daily expression is rejected at deploy time. Viable only if the project moves to Pro, which is the stated production target (`deployment-target.md`).                  |
| **GitHub Actions** `schedule`                                               | No new account; the repository already runs Actions. Secret lives in repository secrets. Caveat: scheduled workflows are best-effort and can be delayed under load, and are disabled automatically after 60 days without repository activity.                                                           |
| **A dedicated cron service** (cron-job.org, EasyCron, Cronitor and similar) | Purpose-built, with run history and alerting — the run history is the diagnostic that was missing this time. Free tiers commonly **auto-disable a job after consecutive failures**, which is one of the two untested explanations for the current state. Confirm custom-header support before choosing. |
| **Upstash QStash**                                                          | Designed for exactly this; supports headers and retries natively. New account and a credential to manage.                                                                                                                                                                                               |
| **A machine crontab**                                                       | Full control, no third party. Requires a host that is always on, and has no run history unless one is arranged.                                                                                                                                                                                         |

**Recommendation:** a dedicated cron service with visible run history and
failure alerting, _or_ GitHub Actions if avoiding another account matters
more. Both keep the endpoint unchanged, and both become a `crons` entry with
no code change if the project later moves to Vercel Pro.

---

## 3. Configuration — **[OWNER, requires production secret handling]**

1. **Confirm `CRON_SECRET` is set** on the Vercel project (Production
   environment). Its presence is enough; the value need not be revealed.
   `verifyCronAuthHeader` fails closed, so an unset secret rejects every
   invocation with `401`.
2. **Put the same value in the scheduler's own secret/header field.** It must
   never appear in this repository, in a commit, in a screenshot, in a chat,
   or in a `NEXT_PUBLIC_*` variable.
3. If the value is unknown on either side, generate a new one and set it in
   **both** places in the same change — see the note on rotation below.
4. Configure: `GET`, the URL above, header `Authorization: Bearer <secret>`,
   every 5 minutes.
5. Enable failure alerting if the service offers it.

**On rotation.** Do not rotate as a first response to a `401`. Rotating
destroys the evidence identifying which side is misconfigured, and re-breaks
the pipeline if the scheduler is the wrong side. Establish first whether an
`Authorization` header is sent at all, whether it carries the exact
`Bearer ` prefix, and whether the two values match — by comparing length and a
short prefix, never by pasting either value anywhere.

---

## 4. First invocation — **[OWNER triggers, agent correlates]**

Trigger the job once on demand and note the minute. Then three sources are
read together:

| Source                                            | Question                                    |
| ------------------------------------------------- | ------------------------------------------- |
| The scheduler's run history                       | Did it fire, and what status did it record? |
| Vercel logs for `/api/cron/outbox-dispatch`       | Did the request arrive? `401` or `200`?     |
| Supabase `edge_logs` for `rpc/outbox_claim_batch` | Did it reach the database?                  |

Readings:

- **Absent from Vercel** → no matching request was observed _in the window
  searched_. Widen the window and drop filters before concluding the job did
  not fire; retention, range and sampling all produce an identical empty
  result.
- **Present, `401`** → it arrived unauthenticated. Diagnose per §3 before
  rotating anything.
- **Present, `200`, with a matching `outbox_claim_batch` line** → the pipeline
  reaches Postgres. Proceed to §5.
- **Present, `200`, without that line** → the cycle ran against something
  other than Postgres. On the current revision this cannot happen silently:
  `lib/db/durable-storage-policy.ts` fails closed, so a construction failure
  throws rather than degrading to memory.

---

## 5. The controlled delivery test — **[OWNER approval required]**

This is the gate on `TAKEAWAY_GUEST_JOURNEY_COMPLETE`. It creates **no
customer-facing request** and needs **no secret to be shared or displayed**.

A `200` from the dispatch route means a cycle ran, not that staff were told.
Those are different claims and only the second one matters here.

1. Insert **one** synthetic `outbox_events` row with
   `destination = 'staff_notification'` and an `entity_id` belonging to no
   real request. This is a staff-facing notification about a fabricated
   internal id — no guest data, no takeaway/booking/event request.
2. Wait one scheduler interval.
3. Expect: the event moves `PENDING → DELIVERED`, and `staff_notifications`
   gains exactly one row whose id equals the outbox event id — the handler
   upserts on that key, which is what makes a retried dispatch idempotent
   rather than duplicating.
4. Confirm the notification is visible to staff in the UI, not merely present
   in the table.
5. Delete the synthetic notification and its outbox event.

Only after step 3 has been **observed once** does notification delivery count
as demonstrated. Until then the journey stays gated: a cart that lets guests
submit orders nobody is notified of is worse than no cart.

---

## What needs owner action

| Item                                    | Why it cannot be done from here                    |
| --------------------------------------- | -------------------------------------------------- |
| Search for an existing job (§0)         | No access to any scheduler account                 |
| Read Vercel function logs               | Vercel CLI reports logged out; no dashboard access |
| Confirm `CRON_SECRET` is set            | Production environment variables                   |
| Choose and configure a service (§2, §3) | Account creation and a production secret           |
| Approve the synthetic outbox row (§5)   | A production write, however small                  |

Everything else — correlating Supabase logs, verifying state transitions,
confirming the notification row and its idempotency key — can be done from
here once a job is firing.

## What is not being claimed

That no scheduler exists. That the previous configuration attempt failed. That
setup is quick — §2 is a real decision with an account, a secret and a
recurring dependency attached, and §5 needs a production write and a wait.
