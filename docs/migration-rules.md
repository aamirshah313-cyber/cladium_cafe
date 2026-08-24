# Migration rules

`supabase/migrations/` is empty on purpose. Runbook Step 7 establishes the
migration _workflow_; the schema itself arrives in later steps.

(This guidance lives in `docs/` rather than inside `supabase/migrations/` to
keep that directory to migrations only. Note the CLI logs an informational
`Skipping migration .gitkeep…` line on every run, because it reports any file
there that is not a `<timestamp>_name.sql` migration. That notice is harmless;
the placeholder exists so git tracks the otherwise-empty directory.)

Upcoming schema steps:

- Step 8 — core content schema (business settings/hours, feature flags, menu
  versions/categories/items/variants/translations/media, pricing rules,
  promotions)
- Step 9 — workflow schema (sessions, carts, confirmation tokens, idempotency
  keys, takeaway/booking/event requests, status/audit events, outbox, webhook
  events, consent events)
- Step 10 — RLS policies, staff roles, MFA policy

## Rules for every migration in this directory

From `cladium-research/architecture/data-model-v2.md` §9:

- Migrations are **immutable** once merged. Never edit an applied migration —
  add a new one.
- Every migration is tested against both a clean database and a
  production-like upgrade fixture.
- Destructive changes use expand → migrate → contract across separate
  releases, with a verified rollback or restore plan.
- Money is integer PKR; timestamps are `timestamptz` in UTC; user-facing rows
  carry `created_at`, `updated_at`, and an integer `version`.

## Naming

The CLI timestamps files for you:

```sh
npm run db:migration:new -- add_menu_tables
# -> supabase/migrations/20260824120000_add_menu_tables.sql
```

Keep one logical change per migration and make the name describe the change.
