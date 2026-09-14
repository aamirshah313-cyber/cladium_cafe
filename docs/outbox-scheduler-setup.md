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

> ## Status: deferred, deliberately
>
> **Nothing in this document has been executed.** Scheduler setup is parked so
> that product work can continue; it is not blocked on a difficulty, and
> nothing decays while it waits. Specifically:
>
> - `TAKEAWAY_GUEST_JOURNEY_COMPLETE` stays `false`, so no guest can reach the
>   takeaway journey.
> - No Cloud Scheduler job exists. The registry at the end of this file is
>   empty, and an empty registry is the authority on that.
> - The synthetic outbox row in the appendix has **not** been run.
> - Production configuration is unchanged.
>
> Two things remain unverified and should not be treated as settled when this
> is picked up: Cloud Scheduler's certificate validation is **inferred from
> the absence of any opt-out**, not confirmed; and the deployed function's
> duration limit has **never been measured**.
>
> ### The sequence when resuming
>
> 1. Confirm the deployed Vercel function's timeout, and that `CRON_SECRET` is
>    present in Production.
> 2. Create the Cloud Scheduler job **paused** — `GET`, `Authorization: Bearer …`
>    entered in the console, 5-minute cadence, 60s attempt deadline, retries
>    disabled.
> 3. Run it **once, manually**, and correlate the Vercel request with an
>    `outbox_claim_batch` line in Supabase.
> 4. Approve one synthetic outbox row and verify a staff notification is
>    visible in the UI.
> 5. Re-run Step 45's go/no-go. **Only then** consider enabling the journey.
>
> Each step gates the next. Skipping to 4 proves nothing about the schedule;
> skipping to 5 proves nothing about delivery.

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

## 2. Choosing a dedicated cron service — **[OWNER decision]**

A dedicated cron service is the chosen approach. Its run history is the
diagnostic that was missing this time: the reason the current state cannot be
explained is that no caller's execution log was ever available.

### Verify these against the provider's current documentation

**These are requirements, not a recommendation of any particular product.**
Free-tier limits, header support and retention change without notice, and this
document is not a reliable source for any provider's present terms — check
them at signup rather than trusting a list.

| Requirement                                         | Why it matters here                                                                              | Fails if                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Custom request headers**                          | The endpoint authenticates by `Authorization: Bearer …` and nothing else                         | No header support at all, or headers limited to a fixed set |
| **1-minute or 5-minute granularity**                | 5 minutes matches `staleClaimMs`; anything coarser delays notifications                          | Minimum interval is 15 min or hourly on the free tier       |
| **Run history with status codes**                   | `401` vs `200` vs no-request is the whole diagnosis                                              | History is absent, or retained for less than a few days     |
| **Failure alerting**                                | A silently disabled job is the failure mode that produced this situation                         | No notification on consecutive failures                     |
| **Auto-disable behaviour, and whether it notifies** | Free tiers commonly disable a job after repeated failures — acceptable, but only if it tells you | Disables silently                                           |
| **Secret storage in the header field**              | The value must not sit in a URL or a shared screenshot                                           | Only query-string parameters supported                      |

A provider that fails the first or third row is unusable here regardless of
price. The rest are judgement calls.

**A URL query token is not an acceptable substitute** for the header. The route
reads `Authorization` only, and a secret in a URL lands in request logs on
every hop.

### Verified against cron-job.org's own documentation, 14 Sep 2026

Checked because it is the usual first choice for this shape of job. It passes
four requirements and **fails one that matters here**.

| Requirement                    | Finding                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom headers                 | **Pass.** The API exposes a `headers` key-value dictionary per job.                                                                               |
| Granularity                    | **Pass.** "Every cronjob can be executed up to 60 times an hour, i.e. every minute."                                                              |
| Run history                    | **Pass.** Per-execution history with timestamps, duration, status and HTTP response.                                                              |
| Failure alerting               | **Pass.** `onFailure` with a configurable `onFailureCount` threshold.                                                                             |
| Auto-disable                   | Disables a job after **25 consecutive failures**, with optional email notification. Acceptable — it is not silent if the notification is enabled. |
| **TLS certificate validation** | **Fail.** Stated plainly: _"We do not check certificates and thus you can also use self-signed certificates."_                                    |
| Request timeout                | 30 seconds maximum, then the connection is terminated. Also reads at most 64 KB of response body.                                                 |

**The certificate finding is the blocker.** This request carries
`CRON_SECRET` as a bearer token. HTTPS is what protects that token in transit,
and a client that does not validate the server certificate cannot detect an
interposed one — an active network attacker between the provider and Vercel
could present their own certificate and capture the secret. For a request
whose entire security rests on a shared secret in a header, "we do not check
certificates" removes the protection that made putting it in a header
acceptable.

That is a judgement, not a rule: the attack needs network position between two
specific hosts. But it is a real weakening of the only control this endpoint
has, and it should be a deliberate decision rather than a default.

**Before choosing any provider, confirm certificate validation explicitly.**
It is rarely mentioned in marketing pages and often only in an FAQ; absence of
a statement is not confirmation. Upstash QStash was checked as an alternative
and its public security page does not state a destination-certificate policy
either way, so it is unconfirmed rather than cleared.

### Timeouts — one estimate, one inference, both unverified

Cloud Scheduler's HTTP target attempt deadline is configurable (default 3
minutes for HTTP targets), which removes the 30-second ceiling cron-job.org
would have imposed. Three things remain open and are recorded as open:

- **Cycle duration is an estimate, not a measurement.** A cycle claims at most
  20 rows and each delivery is one upsert, which _should_ finish in a few
  seconds. That has never been timed. Measuring it needs a local Postgres and
  a seeded batch of 20; an attempt on 14 Sep was blocked by Docker failing to
  start. Until measured, treat "well inside the deadline" as unproven.
- **The deployed function's budget is unconfirmed.** Vercel Hobby functions
  run to 300s under Fluid compute, but projects predating it default to 10s
  with a 60s maximum. This project sets no `maxDuration` and no `vercel.json`
  override, so it inherits whichever applies. Checkable in project settings.
- **Behaviour on caller disconnect is inferred, not documented.** Vercel's
  request cancellation is **opt-in** via `"supportsCancellation": true`, which
  this project does not set — so a disconnecting caller probably does _not_
  abort the function. That is inference from the feature being opt-in, not a
  documented guarantee for the non-enabled case. Do not rely on a cycle
  completing after its caller has given up.

### Selected: Google Cloud Scheduler

**Chosen on the certificate question**, which is the one that disqualified the
obvious candidate.

| Requirement                | Finding                                                                                                                                                                                                                                                                                                                                             | Basis             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Custom headers             | **Pass.** Arbitrary request headers are supported on an HTTP target. A short list is ignored or replaced — `Host`, `X-CloudScheduler`, `X-CloudScheduler-JobName` — and `Authorization` is not among them, provided the job does **not** also configure OIDC/OAuth auth, which would set that header itself. Total header size must be under 80 KB. | Google Cloud docs |
| Granularity                | **Pass.** Standard cron expressions, per-minute.                                                                                                                                                                                                                                                                                                    | Google Cloud docs |
| Execution history          | **Pass.** Per-execution records with status in Cloud Logging.                                                                                                                                                                                                                                                                                       | Google Cloud docs |
| Failure alerting           | **Pass.** Via Cloud Monitoring alerting policies on job failures.                                                                                                                                                                                                                                                                                   | Google Cloud docs |
| **Certificate validation** | **Not positively documented — see below.**                                                                                                                                                                                                                                                                                                          | —                 |

**The remaining uncertainty, stated plainly.** No provider checked publishes a
sentence saying "we verify the target's TLS certificate". Certificate
validation is the default behaviour of every standard HTTP client, so
providers tend to mention it only when they _deviate_ — which is exactly what
cron-job.org does. For Cloud Scheduler the argument is the absence of any
documented way to disable verification: there is no `--skip-tls-verify`
equivalent in the job configuration, and no "allow self-signed certificates"
option of the kind cron-job.org advertises.

That is **inference from absence, not a positive statement**, and it should be
read as such. It is a materially stronger position than cron-job.org's
documented opt-out, but it is not the same as confirmation. If certainty is
required before trusting the secret to it, the check is: create the job
against a host presenting an invalid certificate and confirm the run fails.

**Cost and access.** Cloud Scheduler's free tier covers a small number of jobs
per month; one job at 5-minute cadence is well inside typical free-tier job
counts, but the account requires billing details on file. That is a real
commitment and the reason this is a decision rather than a default.

### Why not the alternatives

**Vercel Cron** is blocked on the Hobby plan: once-daily only, and a sub-daily
expression is rejected at deploy time. It becomes the simplest option if the
project moves to Pro — the endpoint and secret are unchanged, so that is a
`vercel.json` `crons` entry and no code change.

**GitHub Actions `schedule`** avoids a new account but is best-effort on
timing and disables itself after 60 days of repository inactivity — a silent
stop, which is the failure mode being designed against.

**A machine crontab** has no run history unless one is arranged, which gives
up the property this approach was chosen for.

---

## 3. The job configuration — **specification only, no job exists**

> **Nothing here is configured anywhere.** This is a specification to be
> entered into a provider by someone with an account. There is no job, enabled
> or disabled, until a provider issues a **job ID** — and until that ID is
> recorded here, "the job is set up but disabled" would be false. The gap this
> whole document exists to close was caused by exactly that: a scheduler
> reported as configured, with nothing written down to check.
>
> When a job is created, record its **provider, account, and job ID** below.
> Not the secret.

Every value comes from the code, not from prior documentation. Create the job
**disabled** (or paused) so nothing fires until §4's checks pass — a job that
starts running before the secret is confirmed produces a run of `401`s, which
is exactly what drives a free-tier job toward auto-disable.

| Setting          | Value                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Method           | `GET`                                                                                                |
| URL              | `https://cladium-cafe.vercel.app/api/cron/outbox-dispatch`                                           |
| Header name      | `Authorization`                                                                                      |
| Header value     | `Bearer ` + the `CRON_SECRET` value (one space after `Bearer`)                                       |
| Schedule         | every 5 minutes — `*/5 * * * *`                                                                      |
| Timezone         | irrelevant to a fixed interval; UTC if one must be chosen                                            |
| Request timeout  | 30s or more                                                                                          |
| Expected status  | `200`                                                                                                |
| Treat as failure | any non-`200`, especially `401`                                                                      |
| Retry on failure | off — the dispatcher has its own backoff; a scheduler retry adds nothing and muddies the run history |
| Follow redirects | not required, and off is safer                                                                       |

Notes that come from the route, and are easy to get wrong:

- **Only `GET` is exported.** `POST`/`HEAD` return `405`, which a scheduler
  will report as a failure that looks like an outage.
- **Nothing intercepts `/api/cron/*`.** `proxy.ts`'s matcher is
  `['/', '/(en|ur)/:path*']`, so there is no locale redirect on this path —
  worth knowing because some schedulers drop `Authorization` across a
  redirect.
- **The response body is safe to retain** in run history: redacted counts
  only, never event payloads or guest data.
- **Do not enable a scheduler-side retry.** A failed delivery already returns
  to `PENDING` with backoff inside the dispatcher and is retried by the next
  cycle.

### Cloud Scheduler, concretely — **[OWNER, account access required]**

**Create the job in the Cloud Console, not on a command line.** The header
value is a production secret, and a `gcloud` invocation carrying it would put
it in shell history and in the process table, where any other process on the
machine can read it with `ps`. The console's header field, or a protected
secret input, keeps it out of both.

Console path: **Cloud Scheduler → Create job**, with these values:

| Field              | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| Name               | `cladium-outbox-dispatch`                                                           |
| Region             | owner's choice; nearer `hnd1` reduces latency, nothing here is latency-sensitive    |
| Frequency          | `*/5 * * * *`                                                                       |
| Timezone           | UTC                                                                                 |
| Target type        | HTTP                                                                                |
| URL                | `https://cladium-cafe.vercel.app/api/cron/outbox-dispatch`                          |
| HTTP method        | `GET`                                                                               |
| Auth header        | **None** — see the warning below                                                    |
| Header name        | `Authorization`                                                                     |
| Header value       | `Bearer ` + the secret, typed into the console field                                |
| Attempt deadline   | `60s`                                                                               |
| Max retry attempts | `0`                                                                                 |
| Description        | `Drains outbox_events into staff notifications. See docs/outbox-scheduler-setup.md` |

Then **pause the job immediately** after creating it, before §4's checks.

Point by point:

- **Paused first.** Nothing fires until §4 passes. If the console offers no
  create-paused option, create it and pause it as the next action.
- **Set "Auth header" to None.** Choosing OIDC or OAuth makes Cloud Scheduler
  generate its own `Authorization` header, which overwrites the bearer token
  and guarantees a `401`. The custom header is the authentication here.
- **`Max retry attempts: 0`** — the dispatcher has its own backoff; a
  scheduler-side retry adds nothing and muddies the run history.
- **`Attempt deadline: 60s`** is above any plausible cycle while staying below
  a runaway. Revisit once the cycle has actually been timed.

If the job must be created programmatically, pass the header from a file or
environment reference that the provider's tooling reads directly — never as a
literal argument, and never committed.

- **`--max-retry-attempts=0`** — the dispatcher has its own backoff; a
  scheduler-side retry adds nothing and muddies the run history.
- **`--attempt-deadline=60s`** is deliberately above any plausible cycle while
  staying below a runaway. Revisit once the cycle has actually been timed.
- **Region** is the owner's choice; nearer to `hnd1` reduces latency but
  nothing here is latency-sensitive.

Then, for the properties this provider was chosen for:

- **History:** Cloud Logging, filtered to the job's resource — this is the
  per-execution status record that was missing before.
- **Alerting:** a Cloud Monitoring alerting policy on job failures, routed to
  an address that is actually read.

### The secret — **[OWNER, production]**

1. **Confirm `CRON_SECRET` is set** on the Vercel project, Production
   environment. Its presence is what matters; the value need not be revealed
   to anyone, including me. `verifyCronAuthHeader` fails closed, so an unset
   secret rejects every invocation with `401`.
2. **Put the same value in the scheduler's header field.** It must never
   appear in this repository, in a commit, in a screenshot, in a chat, or in
   a `NEXT_PUBLIC_*` variable.
3. If the value is unknown on either side, generate a new one and set it in
   **both** places in the same change.

**On rotation.** Do not rotate as a first response to a `401`. Rotating
destroys the evidence identifying which side is misconfigured, and re-breaks
the pipeline if the scheduler is the wrong side. Establish first whether an
`Authorization` header is sent at all, whether it carries the exact
`Bearer ` prefix, and whether the two values match — by comparing length and a
short prefix, never by pasting either value anywhere.

---

## 4. Activation — **[OWNER, production actions]**

The job stays disabled until these pass, in this order. Each production
action is listed explicitly because none can be done from this workspace.

| #   | Action                                                                                               | Who                                               |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Confirm `CRON_SECRET` is present in Vercel → Production                                              | **owner** — production environment variables      |
| 2   | Run the job **once, manually**, while still disabled — most services offer "run now" on a paused job | **owner** — scheduler account                     |
| 3   | Correlate the three sources below over that minute                                                   | owner supplies Vercel logs; I read Supabase       |
| 4   | Only once a `200` with a matching `outbox_claim_batch` line is seen, **enable the schedule**         | **owner**                                         |
| 5   | Run the controlled delivery test (§5)                                                                | **owner** approves the write; I verify the result |
| 6   | Only after §5 passes once, `TAKEAWAY_GUEST_JOURNEY_COMPLETE` may be reconsidered                     | separate decision                                 |

Enabling before step 3 risks a run of `401`s against a free tier that
auto-disables on consecutive failures — reproducing the exact ambiguity this
whole exercise exists to remove.

### The correlation

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

---

## Job registry — fill in when a job exists

Empty by design. An entry here is what distinguishes a configured job from a
described one.

| Field                            | Value        |
| -------------------------------- | ------------ |
| Provider                         | _(none yet)_ |
| Account                          | _(none yet)_ |
| Job ID                           | _(none yet)_ |
| Created                          | _(none yet)_ |
| Certificate validation confirmed | _(no)_       |
| Enabled                          | _(no)_       |
| First correlated `200`           | _(none yet)_ |
| Delivery test passed (§5)        | _(no)_       |

Never record the secret here.

---

## Appendix — the synthetic delivery row, for review

The exact statement proposed for §5, written out so it can be reviewed before
being approved rather than described in the abstract. **Not yet run.**

```sql
-- One synthetic outbox event. entity_id is a fabricated uuid belonging to no
-- real request; payload carries identifiers only, no guest data.
insert into public.outbox_events (
  id, event_type, entity_type, entity_id, destination, payload, status
) values (
  gen_random_uuid(),
  'delivery_probe.synthetic',
  'TAKEAWAY_REQUEST',
  '00000000-0000-4000-8000-00000000dead',
  'staff_notification',
  '{"probe": true, "note": "synthetic delivery test, safe to delete"}'::jsonb,
  'PENDING'
);
```

Why each field is shaped this way:

- **`entity_type`** must be a real enum value; `TAKEAWAY_REQUEST` is used
  because the notification handler reads it, and no takeaway request carries
  the id below.
- **`entity_id`** is a fixed, obviously-synthetic uuid (`…dead`) that no real
  row uses, so the probe is identifiable and removable without ambiguity.
- **`destination`** must be exactly `staff_notification` — the only registered
  handler. Anything else is marked terminal with "no handler registered",
  which would test the wrong thing.
- **`status`/`next_attempt_at`** default to `PENDING`/`now()`, so the next
  cycle claims it.

### What counts as a pass

Within one scheduler interval, all four:

1. `outbox_events` row moves `PENDING → DELIVERED`, `delivered_at` set.
2. `staff_notifications` gains exactly one row **whose id equals the outbox
   event id** — the handler upserts on that key, which is what makes a
   retried dispatch idempotent rather than duplicating.
3. A matching `rpc/outbox_claim_batch` line appears in Supabase `edge_logs`.
4. **The notification is visible to staff in the UI** — not merely present in
   the table. This is the criterion; the first three are how it is traced.

### Cleanup

```sql
delete from public.staff_notifications where entity_id = '00000000-0000-4000-8000-00000000dead';
delete from public.outbox_events      where entity_id = '00000000-0000-4000-8000-00000000dead';
```

Run after the result is recorded, not before.
