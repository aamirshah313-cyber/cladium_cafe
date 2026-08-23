# Database environments, migrations, and generated types

Runbook Step 7. Authoritative sources: `cladium-research/architecture/deployment-target.md`, `production-architecture-v2.md` §13, `data-model-v2.md` §9.

**Nothing in this repository is linked to a hosted Supabase project.** Linking, creating projects, and setting credentials are human-run steps performed outside the codebase. No credential ever enters git — only `.env.example` placeholders.

## Three isolated environments

| Environment       | Supabase project                                | Credentials live in                       | Rule                                                                                                           |
| ----------------- | ----------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Development       | local stack (Docker) or a dedicated dev project | `.env.local` (git-ignored)                | Test data only. Never production data.                                                                         |
| Preview / staging | its **own** hosted project                      | Vercel "Preview" environment variables    | Separate project, keys, Vapi assistants, webhook URLs, and flags. Preview must never read or write production. |
| Production        | its **own** hosted project (Supabase Pro)       | Vercel "Production" environment variables | Pro plan, correct region, backups, tested restore, MFA for owner/manager.                                      |

Isolation is enforced by using **different projects**, not different schemas or table prefixes inside one project. A shared project with logical separation is not acceptable: a preview deploy with a bug must be incapable of touching real guest requests.

Changing a Vercel environment value requires a new deployment before it takes effect.

## Two connection strings, two jobs

This split is required, not stylistic (`production-architecture-v2.md` §13):

| Variable              | Port                        | Used by                         | Why                                                                                                                                                 |
| --------------------- | --------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | `6543` (transaction pooler) | application request traffic     | Serverless functions open many short-lived connections; the transaction pooler multiplexes them so Postgres does not exhaust its connection slots.  |
| `DIRECT_DATABASE_URL` | `5432` (direct/session)     | migrations and admin tasks only | Migrations need session-level features (advisory locks, `CREATE INDEX CONCURRENTLY`, transactional DDL) that a transaction pooler does not support. |

Notes:

- Append `?sslmode=require` to both.
- With the transaction pooler, disable prepared statements in the client (`pgbouncer=true` / `prepare: false`, depending on the driver).
- Never run a migration through the pooler; it will fail or, worse, half-apply.
- `npm run check:db-config` enforces the port/SSL invariants above against `.env.example` and `supabase/config.toml`. It requires neither Docker nor the Supabase CLI.

## Local development workflow

Requires Docker Desktop and the Supabase CLI (`npx supabase` — intentionally not added as a project dependency; it is a developer tool, not a runtime one).

```sh
npm run db:start      # start the local stack (Postgres, Auth, Storage, Studio)
npm run db:status     # show local service URLs and ports
npm run db:reset      # drop, recreate, and re-apply every migration from scratch
npm run db:stop       # stop the local stack
```

`db:reset` is the check that matters: it proves the full migration history applies cleanly to an empty database. Run it before opening any PR that touches `supabase/migrations/`.

### Creating a migration

```sh
npm run db:migration:new -- add_menu_tables   # create an empty timestamped file
# edit supabase/migrations/<timestamp>_add_menu_tables.sql
npm run db:reset                              # verify it applies from clean
npm run db:types                              # regenerate types, then commit both
```

If you changed the local schema through Studio instead of by hand, capture it with `npm run db:diff -- -f <name>` and review the generated SQL before committing — generated diffs frequently need editing.

## Generated types workflow

```sh
npm run db:types      # writes src/lib/db/database.types.ts from the LOCAL database
```

- The output is generated: never hand-edit it. It carries a "do not edit" header.
- Regenerate and commit it in the **same** commit as the migration that changed the schema, so types and schema never drift apart.
- The file does not exist yet — there is no schema until Step 8. The generated-types freshness check will be added alongside the first generated file.
- Generate from the local database, not from production.

## Applying migrations to hosted environments

Human-run, and deliberately not automated in this step:

```sh
npx supabase link --project-ref <ref>   # once per environment, per machine
npx supabase db push                    # applies pending migrations
```

Order is always **staging first**, verify, then production. Production runs through a guarded release job with a health check afterwards and a rollback path kept available (`production-architecture-v2.md` §13). Never point a local shell at production casually; use the direct connection and confirm which project is linked with `npx supabase projects list` before pushing.

## Seed data

No seed file exists yet. When one is added it may contain **only** owner-approved business and menu fixtures, and only for development/staging. Never seed fake testimonials, ratings, promotions, confirmations, or production customer data (`data-model-v2.md` §9). The production menu import creates a reviewable _unpublished_ version; publishing requires owner sign-off.

## Blockers before any hosted database exists

These are owner/operator decisions, not code:

- Supabase organisation and three projects created (dev/staging/production), Pro plan on production.
- Database region chosen **first**, then the Vercel function region placed near it.
- Backup schedule and a **tested** restore procedure.
- Staff accounts, roles, and enforced MFA for owner/manager.
