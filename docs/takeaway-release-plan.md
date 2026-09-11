# Takeaway release plan — migration, rollback, and the delivery test

Written 11 Sep 2026, after the takeaway Postgres cutover (D-090) and the
fail-closed storage change (D-089). Nothing in this document has been
executed against production. Every step marked **[APPROVAL]** needs the
owner's explicit go-ahead, and several need someone with Vercel or scheduler
access, which this workspace does not have.

`TAKEAWAY_GUEST_JOURNEY_COMPLETE` stays `false` throughout everything below.
Turning it on is a separate, later decision that depends on step 5 passing.

---

## 0. What is being shipped

One additive migration and a set of adapters that move takeaway off
per-process `Map`s and onto Postgres, plus a change that makes missing
durable storage fail loudly instead of silently degrading.

| Change                                                      | Guest-visible?     |
| ----------------------------------------------------------- | ------------------ |
| `20260909180000_takeaway_submit_atomic.sql`                 | no                 |
| `postgres-cart-store.ts`, `postgres-takeaway-submission.ts` | no                 |
| `takeaway/deps.ts` cut over to Postgres                     | no                 |
| `durable-storage-policy.ts` (fail closed)                   | no                 |
| `[locale]/takeaway/` cart + review page                     | **no — gated off** |

The takeaway page and the menu's add control are both behind
`FEATURE_TAKEAWAY_REQUESTS && TAKEAWAY_GUEST_JOURNEY_COMPLETE`, and
`proxy.ts` 404s `/[locale]/takeaway` on the same condition before rendering
starts. With the constant `false`, this deploy changes nothing a guest can
see or reach.

---

## 1. Pre-deploy checks — done

- `npm run verify` passes end to end (exit 0) in a clean checkout containing
  exactly these changes and **no** `.env*` file except `.env.example`. That
  includes a real `next build` with fonts fetched over the network, and both
  security scanners passing on their own terms.
- 8/8 takeaway cutover integration tests and 124/124 integration tests total,
  from a bare `supabase db reset`.
- 1158/1158 unit tests.

## 2. Migration — **[APPROVAL]**

`supabase/migrations/20260909180000_takeaway_submit_atomic.sql` creates one
function. It is additive (D-046): no table, column, type, policy or grant is
altered or dropped.

```
supabase db push        # applies pending migrations to the linked project
```

**Order matters: apply the migration before deploying the application.** The
new code calls `takeaway_submit_request`; the old code does not. Migration
first is therefore safe in both directions, and the reverse is not.

Post-migration check (read-only):

```sql
select p.proname, p.prosecdef as security_definer, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'takeaway_submit_request';
```

Expect exactly one row, `security_definer = false`, and `proconfig`
containing `search_path=` (D-073). Then confirm the grants (D-065): execute
revoked from `public`, granted to `service_role`.

## 3. Deploy — **[APPROVAL]**

Standard Vercel deploy of the same revision that was verified.

**Expect one behaviour change on the server, and watch for it.** Any route
whose durable storage cannot be constructed now returns a `500` instead of
quietly serving from memory. If `NEXT_PUBLIC_SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY` is absent or wrong in the production
environment, the takeaway routes and the outbox dispatch route will fail
loudly on first request. **That is the intended improvement, not a
regression** — but confirm both variables are present in the Vercel project
settings _before_ deploying, because this change removes the safety net that
was hiding their absence.

Build-time note: `next build` evaluates route modules with no credentials.
That is why `concierge/deps.ts` reads its stores through getters rather than
at module scope — an eager read there failed the build outright once the
fallback was removed. Any future module-scope `xDeps.someStore` will break
the build the same way.

## 4. Rollback

| Scenario                             | Action                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App misbehaves after deploy          | Roll back the Vercel deployment to the previous production build. **Leave the migration in place** — the function is unreferenced by the old code and harms nothing. |
| Need to remove the function too      | `drop function if exists public.takeaway_submit_request(jsonb);` — safe once no deployment calls it. Nothing depends on it: no view, trigger, policy or FK.          |
| Fail-closed behaviour is the problem | Do **not** set `ALLOW_IN_MEMORY_STORES=true` in production. That converts a visible failure back into silent data loss. Fix the credential instead.                  |

No data migration is involved, so there is no data rollback. Guest-visible
state is unchanged in both directions because the journey stays gated off.

## 5. The controlled notification-delivery test — **[APPROVAL]**

This is the gate on `TAKEAWAY_GUEST_JOURNEY_COMPLETE`, and it is where the
open question actually lives. It creates **no customer-facing request** and
needs **no secret to be shared or displayed**.

### 5a. Establish whether the scheduler runs at all

Evidence (see `.continuum/TASKS.md`): zero `rpc/outbox_claim_batch` calls have
reached Postgres, and `staff_notifications` has `n_tup_ins = 0`.

**Stated precisely: production notification delivery remains _unproven_.** An
earlier version of this section claimed "zero inserts for the lifetime of the
project", which the data does not support — `pg_stat_database.stats_reset` for
this database is **2026-08-25 20:41:21Z**, so those counters describe activity
since that timestamp only, and statistics can be reset. The window does still
contain all six known production submissions (5–6 Sep), so the absence is
meaningful; it is simply not a lifetime claim.

The deciding evidence is on Vercel's side and is not readable from this
workspace.

Ask the owner to trigger the scheduler **once, on demand**, and note the
minute. Then correlate three sources over that minute:

| Source                                               | Question it answers                         |
| ---------------------------------------------------- | ------------------------------------------- |
| The external scheduler's own run history             | Did it fire, and what status did it record? |
| Vercel function logs for `/api/cron/outbox-dispatch` | Did the request arrive? `401` or `200`?     |
| Supabase `edge_logs` for `rpc/outbox_claim_batch`    | Did it reach the database?                  |

Readings:

- **Absent from Vercel** → the scheduler is not firing. Fix the schedule.
- **Present, `401`** → the request arrived but did not authenticate. **Do not
  rotate `CRON_SECRET` as a first move.** Rotating destroys the evidence that
  would identify which side is misconfigured, and if the scheduler is the wrong
  side it re-breaks the pipeline while looking like a fix. Diagnose in order:
  1. Is the scheduler sending an `Authorization` header at all? Some schedulers
     silently drop headers on redirect, or need them configured per-request
     rather than per-job.
  2. Is it exactly `Authorization: Bearer <secret>`? `verifyCronAuthHeader`
     expects that prefix; a bare secret, `Basic`, or a custom header name all
     produce an identical `401`.
  3. Do the two values match? Compare lengths and a short prefix/suffix on each
     side rather than pasting either value anywhere — a trailing newline or a
     quoted value in the scheduler's config is a common cause.
     Rotate only once you have established that the secret itself is the problem,
     and then set both sides in the same change. Never paste the value into a chat
     or a file.
- **Present, `200`, and a matching `outbox_claim_batch` line** → the pipeline
  is reaching Postgres. The earlier 24-hour gap was a scheduling lapse.
- **Present, `200`, but no `outbox_claim_batch` line** → the dispatcher ran
  against something other than Postgres. On the _current_ production
  revision that means the silent in-memory fallback; on the new revision this
  combination cannot occur, because construction failure now throws.

### 5b. Prove delivery, not just invocation

A `200` from the dispatch route means "a cycle ran", not "staff were told".
The two are distinguishable by one query, and this is the check that matters:

```sql
select count(*) as delivered_ever from public.staff_notifications;
```

It has never been observed as anything but `0`. A successful delivery test must move it.

Procedure, once 5a shows the scheduler reaching Postgres:

1. Insert **one** synthetic outbox event directly, with a destination the
   handler recognises and an entity id that belongs to no real request. This
   is a staff-facing notification about a fabricated internal id — it creates
   no takeaway/booking/event request, and no guest data. **[APPROVAL]**
2. Wait for one scheduler interval.
3. Expect: the event's `status` moves `PENDING → DELIVERED`, and
   `staff_notifications` gains exactly one row, whose id equals the outbox
   event id (D-087 makes the outbox event id the notification primary key,
   which is what makes a retried dispatch idempotent rather than duplicating).
4. Confirm the notification is visible in the staff UI.
5. Delete the synthetic notification and its outbox event.

Only after step 3 has been observed **once** does notification delivery count
as verified. Until then the takeaway journey stays gated, because a guest
would otherwise be submitting requests that reach staff by no proven route.

## 6. Only then — the journey flag

Flip `TAKEAWAY_GUEST_JOURNEY_COMPLETE` to `true` in a separate commit, deploy,
and re-run the guest journey against production once. That is a further
**[APPROVAL]** and is deliberately not bundled with anything above.
