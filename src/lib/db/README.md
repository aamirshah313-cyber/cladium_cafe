# src/lib/db

Database access layer. Currently holds only this note — repositories arrive in
Step 19, after the schema (Steps 8–9) and RLS (Step 10).

## `database.types.ts` (generated, not yet present)

```sh
npm run db:types
```

Regenerates `database.types.ts` from the **local** database. Rules:

- Generated output — never hand-edit it.
- Commit it in the same commit as the migration that changed the schema, so
  types and schema cannot drift.
- Generate from local, never from production.

It does not exist yet because there is no schema yet. See
`docs/database-environments.md` for the full workflow.
