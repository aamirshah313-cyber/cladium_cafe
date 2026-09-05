# src/lib/db

Database access layer: the generated schema types, and the Postgres
repository adapters that implement `src/lib/domain`'s storage interfaces.

## Repository adapters

Each adapter implements one interface from `src/lib/domain` against real
Postgres, using the server-only service-role client
(`modules/integrations/supabase-admin-client.ts`). They are drop-in
replacements for the in-memory stores, so `src/lib/domain` keeps its
interfaces and no calling code changes.

| Adapter                                | Implements                                  | Wired into a domain?                              |
| -------------------------------------- | ------------------------------------------- | ------------------------------------------------- |
| `postgres-confirmation-token-store.ts` | `ConfirmationTokenStore`                    | No — built and tested, not yet used at runtime    |
| `postgres-idempotency-store.ts`        | `IdempotencyStore<R>`                       | No — built and tested, not yet used at runtime    |
| `postgres-versioned-store.ts`          | `VersionedStore<T>`                         | No — generic mechanism, needs a per-table mapping |
| `postgres-booking-request-store.ts`    | `VersionedStore<BookingRequestRecord>`      | No — built and tested, not yet used at runtime    |
| `postgres-append-only-sink.ts`         | `AppendOnlySink<T>`                         | No — generic mechanism, needs a per-table mapping |
| `postgres-event-sinks.ts`              | `AppendOnlySink<StatusEvent \| AuditEvent>` | No — built and tested, not yet used at runtime    |
| `postgres-outbox-store.ts`             | `OutboxStore`                               | No — built and tested, not yet used at runtime    |
| `postgres-takeaway-request-store.ts`   | `VersionedStore<TakeawayRequestRecord>`     | No — built and tested, not yet used at runtime    |
| `postgres-event-request-store.ts`      | `VersionedStore<EventRequestRecord>`        | No — built and tested, not yet used at runtime    |

`outbox_claim_batch` (the function behind `postgres-outbox-store.ts`'s
`claimBatch`) was rewritten in
`20260905020000_fix_outbox_claim_batch_limit.sql` after a real
over-claiming bug was found running through PostgREST — see D-072.
Candidate ids are now materialized into a plain array before the `UPDATE`
runs, rather than a correlated subquery inside the `UPDATE`'s own `WHERE`.
If a future change to this function is needed, keep that shape:
select-then-array, not `WHERE id IN (SELECT ... LIMIT ... FOR UPDATE)`.

That completes all five storage primitives and all three request mappings.
Every domain's _request row_ can now be read and written against real
Postgres. Still missing: the `takeaway_items` line-snapshot sink,
genuinely blocked rather than unbuilt — its `menu_item_id` is a foreign
key into `menu_items`, and nothing guest-facing reads `menu_items` yet
(see the menu-review section below, D-072), so a line snapshot still has
nothing to point at.

## The bookings cutover (built and proven, not switched on)

`modules/bookings/deps.ts` exports `createPostgresBookingDeps(client)`,
wiring bookings' five domain-specific stores to the adapters above.
`tests/integration/bookings-postgres-cutover.test.ts` proves the real,
unmodified `prepareBookingRequest`/`submitBookingRequest`/
`transitionBookingRequest` services produce a consistent set of rows
across `confirmation_tokens`, `idempotency_keys`, `booking_requests`,
`status_events`, and `audit_events` — the first test in this project to
exercise a full domain flow against real Postgres rather than one store
in isolation. See D-071.

**`bookingDeps` — the live singleton every booking route imports — is
unchanged.** Building `createPostgresBookingDeps()` and switching the app
to use it are two different decisions. The switch is deliberately not
made here:

- `bookingDeps` is constructed once at module import time. Building a
  real `SupabaseClient` there would call the throwing (`.parse()`, not
  `.safeParse()`) env parsers eagerly, and this sandbox has no
  `.env.local` — every file importing `modules/bookings/deps.ts` would
  fail at import, not just at request time.
- This repo's `master` branch auto-deploys to the live staging Vercel
  project. Every commit this session has landed there directly, with no
  review gate. Flipping the live singleton is the first change in this
  whole sequence that would alter what the deployed app actually does the
  moment it is pushed, against the real staging Supabase project — which
  this sandbox cannot reach to verify beforehand.
- `outbox` stays the shared in-memory singleton
  (`modules/notifications/deps.ts`) even inside
  `createPostgresBookingDeps()`, on purpose: switching it here would
  silently change takeaway's and events' notification durability too,
  since all three domains share that one object. That is a decision
  belonging to `notifications/deps.ts` itself. The real, stated
  consequence of leaving it as-is: a process exit between
  `requestStore.create()` succeeding and `outbox.append()` running would
  leave a booking permanently persisted with no staff notification ever
  generated — a risk that did not exist while everything was in-memory (a
  crash lost the whole attempt, leaving nothing half-written), and is
  specific to this partial cutover.

`postgres-event-request-store.ts` deliberately **refuses to write a
non-null `quotedAmountPkr`**: `event_requests_quote_attribution` requires
`quoted_by`/`quoted_at` alongside it, and `EventRequestRecord` has neither
field — no service in this codebase produces a quote yet. Reads still
resolve a real quote written outside this adapter (verified against a real
GoTrue-provisioned staff fixture, not a raw insert), so the store stays
honest about data it did not itself write.

## Staff menu review/publish (built, real, not guest-reachable)

`modules/menu/admin-service.ts` executes, for real, the plans
`import-plan.ts`/`publish-plan.ts`/`diff-report.ts` have computed since
Step 11 with no database connection of their own: `OWNER`/`MANAGER` staff
can import the current `menu.json`, review a real diff against whatever is
published, approve, and publish, via `/staff/menu`. Unlike every adapter
above, this is not a dormant, unwired capability — it is real, working,
and reachable by any signed-in `OWNER`/`MANAGER` the moment it deploys.
That is safe because `modules/menu/menu-view.ts#getPublishedMenuView()`
has no database call at all and always returns `UNPUBLISHED` — confirmed
live, not assumed: after real publish cycles, `/en/menu` still showed the
unchanged guest-facing "not available yet" message. See D-072.

`takeaway_items` is not merely unwritten — it is blocked. A menu version
_can_ now be imported (`modules/menu/admin-service.ts`, D-072), but nothing
guest-facing reads `menu_items` yet — `MenuViewItem.id`, which supplies
`takeaway_items.menu_item_id` at runtime, has no
concrete source either: `getPublishedMenuView()` still returns
`UNPUBLISHED` and is itself the seam a future menu repository fills.

`VersionedStore` is split in two because all three request tables share the
interface but none maps 1:1 onto its domain record:
`postgres-versioned-store.ts` holds the mechanics (compare-and-set, paging,
the trigger-owned `version`) and each domain supplies its own mapping —
`postgres-booking-request-store.ts`, `postgres-takeaway-request-store.ts`,
and `postgres-event-request-store.ts` above. Each mapping's own doc comment
covers its specific gaps (the date/time conversion, the menu-version
foreign key, the field renames); see D-066/D-069/D-070.

Where a table does not map 1:1 onto its domain record, the adapter's own
doc comment enumerates every gap and why it was resolved the way it was.
`postgres-idempotency-store.ts` is the worked example: it hashes the
fingerprint (which is a raw, still-valid confirmation token) before
storage, supplies `operation` per store rather than parsing the domain's
`scope` string, projects the result to an entity reference, and writes but
never interprets `expires_at`.

Adapters are added one at a time and are **not** switched on merely by
existing: a domain keeps using its in-memory store until its `deps.ts` is
deliberately changed over. See D-023 and D-064 in `.continuum/DECISIONS.md`.

Rules these adapters follow:

- Service-role and server-only. Guest-facing code never reaches them, and
  no guest-write RLS policy was added to accommodate them.
- Operations the domain documents as atomic must be a **single**
  conditional statement (`UPDATE ... WHERE <precondition> RETURNING ...`),
  never a read followed by a write. Sequential tests cannot tell the
  difference; concurrent ones can, so they are tested with `Promise.all`.
- Normalise `timestamptz` back through `new Date(...).toISOString()`.
  Postgres returns `+00:00` where JavaScript produces `.000Z` — the same
  instant, a different string, and the domain types these as plain
  `string`.
- Throw on database errors. These interfaces have no error channel, and a
  swallowed write error is indistinguishable from success.
- Page explicitly rather than relying on a single `select`. PostgREST caps
  a response at `max_rows` (1000 in `supabase/config.toml`), and a silent
  cap would drop rows off the end of a staff queue or an audit trail with
  nothing to indicate anything was missing.

`status_events`, `audit_events`, and `consent_events` additionally carry a
`forbid_row_change()` trigger rejecting every UPDATE and DELETE, including
for `service_role` — a trigger is not role-scoped. Their integration tests
therefore cannot clean up after themselves: they tag rows with a unique
correlation id, find only their own, and never assume an empty table.

### Testing them

Adapter tests talk to a real database and live in `tests/integration`, so
they are deliberately excluded from `npm test`, `npm run verify`, and CI:

```sh
npx supabase start -x realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,mailpit
npm run test:integration
```

The lean service list is not arbitrary — see D-063. They skip themselves
with an explicit message when `SUPABASE_TEST_URL` /
`SUPABASE_TEST_SERVICE_ROLE_KEY` are unset, so a run without a database
reports "skipped" rather than a false pass.

**Reset before running `npm run db:test` afterwards.** The integration
tests write to `status_events` and `audit_events`, which are append-only
and so cannot be cleaned up. `db:test:rls` asserts exact row counts and
assumes an empty database, so it fails with something like
`auditor reads audit events: expected 0 row(s), got 8` on a database the
integration tests have touched. That is leftover fixture data, not a policy
regression — `npm run db:reset` first, then `npm run db:test`.

## `database.types.ts` (generated)

```sh
npm run db:types
```

Regenerates `database.types.ts` from the **local** database. Rules:

- Generated output — never hand-edit it.
- Commit it in the same commit as the migration that changed the schema, so
  types and schema cannot drift.
- Generate from local, never from production.

See `docs/database-environments.md` for the full workflow.
