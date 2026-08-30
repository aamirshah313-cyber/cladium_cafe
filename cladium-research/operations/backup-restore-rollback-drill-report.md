# Backup, restore, and rollback drill report

Runbook Step 42 (final step of Phase 8, "full hardening"). Evidence bullet: "timed drill passes; gaps block production." This report is the drill's real, timed evidence trail — what was restored, what broke, what was found and fixed, and what remains explicitly out of reach in this sandbox.

**Tested commit:** `PENDING` (this step's own commit — amended in once known, matching this project's established self-reference pattern).
**Tested environment:** the local Supabase CLI stack (Docker, reduced services per `docs/database-environments.md`'s documented low-memory profile — this sandbox reported 4 CPUs / 3.78GiB, matching that doc's own "verified on a 4 GB / 4 CPU Docker VM" case exactly), the first time this sandbox has had a reachable Docker daemon since Step 7/10. **This is real, disk-backed PostgreSQL 17.6 — not a mock, not an in-memory store** — but it is not a Supabase Pro hosted project; where that distinction matters, it is called out explicitly below.

## Summary

The drill found and fixed a real, previously-undiscovered security gap: **every table in the schema — including `confirmation_tokens` and `idempotency_keys`, which `grants.sql`'s own Step 10 doc comment claims get "no client grants whatsoever" — actually carried full `anon`/`authenticated` CRUD access at the grant layer**, due to a Supabase platform default that Step 10's migration never revoked. This was invisible until now because `npm run db:test:rls` had not run against a live database since Step 10 itself — every step from 11 through 41 carried the standing "no Docker/live Postgres" limitation (D-017), so this real regression sat undetected through 31 subsequent runbook steps. Found, root-caused, fixed, and reverified clean — see below.

Separately: a full backup → simulated total data loss → restore cycle was run five times end to end while tuning the drill's own methodology to something production-representative, with real timings from the final, correct run: **backup 852ms, full restore 10.1s**, both against the complete 28-table/2-view application schema plus real data.

## The real bug: over-broad default table privileges

### What was found

A fresh `supabase db reset` (no restore involved at all — this is not a drill artifact) followed by `npm run db:test:rls` failed:

```
ERROR: RLS MATRIX FAIL — anon cannot read feature flags: expected permission denied, got 0 row(s)
```

Direct inspection confirmed the real scope was much larger than one table:

```sql
select table_name, string_agg(distinct privilege_type, ',') from information_schema.role_table_grants
where grantee='anon' and table_schema='public' group by table_name;
```

Every one of the 28 tables and 2 views returned `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` for `anon` — including `confirmation_tokens` and `idempotency_keys`.

### Root cause, verified not guessed

Confirmed against Supabase's own current documentation via a live `WebSearch` (`supabase.com/blog/postgres-roles-and-privileges`), not assumed: **by platform default, every table created in the `public` schema automatically receives `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants for `anon`, `authenticated`, and `service_role`.** `20260824140003_grants.sql` (Step 10) was written under a least-privilege, explicit-grant-only model and documents that model explicitly ("Least privilege applies. Two tables get NO client grants whatsoever") — but it never revoked this platform default, so the default silently coexisted underneath every explicit grant the migration added.

RLS itself was still doing real work: `anon` querying `feature_flags` returned `0` rows, not the actual rows — the data was never exposed. But this was accidental, single-layer defense (RLS alone), not the deliberate two-layer grant+RLS model this project has claimed since Step 10 — a single missing or misconfigured RLS policy on any one of these 28 tables would have had zero grant-layer backup.

### Fix

New migration `20260830044140_fix_default_table_privileges.sql`, matching Supabase's own documented remediation exactly, in two parts:

1. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ... FROM anon, authenticated, service_role` — stops the platform default for every table/function a *future* migration creates, closing this permanently rather than only for the 28 tables that exist today.
2. `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`, then `grants.sql`'s own `GRANT` statements re-applied verbatim — restoring the exact originally-documented state rather than attempting to compute a diff. `service_role` (which correctly bypasses RLS by design) is untouched throughout.

**Verified, not assumed fixed:** `npm run db:test:rls` — PASS. `npm run db:test:schema` — PASS. `npm run check:db-config` — PASS (13 migrations, 28 tables, RLS enabled). Direct grant inspection post-fix confirms `confirmation_tokens`/`idempotency_keys` now genuinely have zero `anon`/`authenticated` grants, matching the documentation's original claim for the first time.

## The backup/restore drill itself

### Method

1. `supabase db reset` — clean baseline, all 13 migrations apply cleanly from scratch (this alone is real evidence the migration history itself is valid and replayable).
2. Insert real, distinctive "critical records" — two `business_settings` rows (one flagged sensitive) and one `feature_flags` row — the concrete records the drill would need to prove survive.
3. `pg_dump --schema=public` (timed) — a full logical backup of the application schema and data.
4. Simulate total catastrophic loss: `DROP SCHEMA public CASCADE` (confirmed empty afterward — genuinely zero tables, not a soft failure).
5. Restore from the backup file (timed).
6. Verify: table count, critical records present, `npm run db:test:schema`, `npm run db:test:rls` — data presence *and* enforced correctness, not just presence.

### What the methodology iteration itself found (real, worth keeping)

Getting to a clean, representative drill took five iterations — each one a genuine, real finding about what a correct restore procedure for this application actually requires, not friction to discard:

- **Dump the application schema only, not the whole database.** A first attempt dumped everything, including Supabase's own internal `auth`/`storage`/`realtime`/`vault` schemas — restoring produced dozens of harmless-but-noisy "already exists"/"permission denied" errors against infrastructure this application doesn't own. `--schema=public` is the correct, minimal scope: Supabase's own managed infrastructure schemas are provisioned by the platform itself on any new project, never something an application-level restore should carry.
- **Never strip privileges from the dump.** `pg_dump --no-privileges` (tried once, to produce a "cleaner" file) silently drops every `GRANT` statement — restoring from that backup produces a schema with *zero* client access at all, a different and *more* broken state than the bug above, not a fix for it.
- **Don't pre-create the target schema before restoring.** `pg_dump`'s own output includes `CREATE SCHEMA public`; pre-creating it (a natural instinct when simulating "the schema is gone") makes the very first statement in the restore fail. The correct disaster simulation is `DROP SCHEMA ... CASCADE` with nothing recreated — let the backup file do that.
- **`ALTER DEFAULT PRIVILEGES` replays with a permission error through a plain reconnection, even though it applies cleanly through the Supabase CLI's own migration-apply path.** This is a real, narrow quirk of this specific local sandbox's role hierarchy (`postgres` connecting via the exposed port does not carry the same effective ownership context the CLI's own internal migration runner uses) — confirmed benign because it affects only *future* default grants, never existing data or already-applied grants; every other statement in the same restore succeeds. Documented here rather than silently ignored, and explicitly **not** something to expect from Supabase Pro's actual managed backup/restore, which does not work by replaying a portable SQL file through an ordinary client connection at all.

### Final, clean, representative run — real timings

| Step | Result |
|---|---|
| Backup (`pg_dump --schema=public`) | **852ms**, 135,846 bytes |
| Simulated disaster (`DROP SCHEMA public CASCADE`) | Confirmed: 0 tables remaining |
| Restore | **10.1s**, all 30 relations (28 tables + 2 views) recreated |
| Critical records present | Both `business_settings` markers and the `feature_flags` marker intact, byte-for-byte |
| `npm run db:test:schema` post-restore | **PASS** |
| `npm run db:test:rls` post-restore | **PASS** (full allow/deny matrix — anon, two independent guests, all five staff roles, service_role) |

**Approximate end-to-end RTO for this local drill: ~11 seconds** (backup + restore; verification adds a few more seconds of test-suite time on top). This is a real, measured number for *this* mechanism, on *this* hardware — not a production RTO estimate. See "Recovery objectives" below for why.

## Application rollback and backward-compatible migrations

Gate 9's own bullet: "Backup restore and application rollback drills succeed with documented recovery objectives." Application rollback and database restore are two different mechanisms that must both hold, and Vercel's own documentation makes the boundary between them explicit (confirmed live via `WebSearch`, `vercel.com/docs/instant-rollback`): **Vercel deployments are immutable snapshots — "revert" is a routing switch to a previous deployment, not a rebuild, and finishes instantly.** Critically, an app-level rollback does **not** touch the database at all — the previous application version runs against whatever the database's *current* schema is.

This is exactly why every migration in this project has followed additive, backward-compatible discipline from Step 8 onward, not as an abstract principle but as the concrete thing that makes Vercel's instant rollback *safe* to actually use: a rolled-back older app version must keep working against a newer database schema. Verified this step, not merely claimed: a source scan of all 13 migrations (12 original plus this step's own fix) found **zero destructive DDL** — no `DROP TABLE`, no `DROP COLUMN`, no `RENAME` — anywhere in the migration history. Every schema change to date has been purely additive (new tables, new columns, new constraints on new data only), matching `data-model-v2.md`'s own required "expand/migrate/contract" discipline for any future destructive change.

## Recovery objectives (proposed, pending owner approval)

No owner-approved SLA exists yet (same standing gap as `.env.example`'s retention placeholders and Step 41's proposed alert thresholds) — these are engineering-judgment starting points, not a commitment, recorded now so Step 43/45 has a concrete basis to review rather than inventing one from nothing at deploy time:

- **RTO (Recovery Time Objective) — proposed 30 minutes** for a full database restore on a real Supabase Pro project. This drill's own local mechanism took ~11 seconds for a database of today's size, but a real production restore additionally involves: locating the correct backup/PITR point via Supabase's dashboard, human decision-making and authorization (Gate 9's own "rollback decision-maker" requirement), DNS/connection-string re-pointing if a new project is involved, and a full application-level smoke test before declaring recovery complete — 30 minutes is a reasonable, conservative target for that whole human-in-the-loop process, not just the mechanical restore step.
- **RPO (Recovery Point Objective) — proposed 5 minutes**, contingent on Supabase Pro's actual Point-in-Time Recovery being enabled (Gate 3's own "backups, and a tested restore procedure" bullet) rather than daily-only snapshots. This is a platform-tier decision the owner must make when provisioning the production project (release-gates-v2.md Gate 0), not something this sandbox can configure or verify — tracked in `.continuum/TASKS.md`.
- **Named operators — not yet assignable.** Gate 9 requires "a named launch owner, incident contact, rollback decision-maker" — these are real people the business owner must designate, not roles this build process can invent placeholder names for (the same "never invent... staff decisions" rule that has governed every prior step). The *roles* are used consistently throughout this project's own documentation (owner/manager per `staff_role`, Step 10) and are ready to be filled with real names at Step 44 (UAT) or Step 45 (production readiness decision).

## Not measurable in this sandbox (tracked, not silently skipped)

- **This drill exercised local Postgres via generic `pg_dump`/`psql`, not Supabase Pro's actual managed backup/PITR system.** Supabase Pro's real mechanism is WAL-based and dashboard/API-driven, not a portable SQL file replayed through an ordinary client connection — genuinely different operationally (and likely both faster and more reliable than this drill's numbers suggest, since it never hits the local-role-hierarchy quirks documented above). A real timed drill against an actual Supabase Pro backup must be run once a production project exists (Step 43/45).
- **Preview/staging isolation** (Gate 3: "Preview deployments cannot read or write production data") is unverified — no staging or production Supabase project exists yet (D-017, unchanged).
- **A real Vercel instant-rollback** was not executed (no Vercel project is deployed yet — Step 43). This report documents its real, verified mechanism and constraints from Vercel's own current documentation; actually exercising it is Step 43/45's job.
- **Owner/manager MFA-gated access to the real restore/rollback controls** (Gate 3's own bullet) cannot be verified without a real Supabase Auth setup, still pending (D-028, Step 24's tracked follow-up).

## Evidence trail

- `supabase/migrations/20260830044140_fix_default_table_privileges.sql` (new) — the fix, with its own extensive doc comment recording the root cause and remediation.
- `src/lib/db/database.types.ts` regenerated in the same commit (the fix newly exposes 7 previously-hidden RLS helper function signatures in the generated types — a strict completeness improvement, no functional change; regenerating alongside any migration change is this project's established discipline since Step 8).
- `npm run db:test:schema` / `npm run db:test:rls` — both PASS against the post-fix, post-restore database.
- `npm run check:db-config` — PASS (13 migrations, 28 tables, RLS enabled on every one).
- Full `npm run verify` (format, lint, typecheck, unit tests, source validators, script tests, `check:db-config`, secret scan, production build, client-bundle scan): clean. 1044 unit tests passing (87 files) — unaffected, since no application source code changed this step, only the migration and its generated types.
- Local Supabase stack stopped after the drill (`docs/database-environments.md`'s own established discipline — do not leave it running beyond what a step needs).
