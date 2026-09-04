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

That completes the five storage primitives `src/lib/domain` defines. What
remains before a domain can actually be cut over is the two missing
`VersionedStore` mappings (takeaway, events) and the cutover itself.

`VersionedStore` is split in two because all three request tables share the
interface but none maps 1:1 onto its domain record:
`postgres-versioned-store.ts` holds the mechanics (compare-and-set, paging,
the trigger-owned `version`) and each domain supplies its own mapping.
Takeaway and events are not built yet — takeaway needs `menuVersionNumber`
resolved to a `menu_versions` foreign key, and events renames several
fields on top of the same date/time conversion bookings needed. Those are
real decisions, deliberately not guessed at.

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
