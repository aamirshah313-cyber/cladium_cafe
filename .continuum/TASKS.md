# Cladium task ledger

## Active

- [ ] P1 — Commit Steps 8–10 (migrations, generated types, db test scripts, config/doc updates) — currently uncommitted; ask before committing.
- [ ] P1 — Step 11: menu normalization and import into an unpublished version.

## Next

- [ ] P1 — Step 12: security foundation (cookies, CSRF/origin, headers, rate limits, webhook verification, redaction).
- [ ] P2 — Optional: raise Docker to ~7 GB for full-stack local work (Studio/Storage/Realtime/Edge Functions). Not needed for migrations — see `docs/database-environments.md`.

## Blocked for production, not safe scaffolding

- [ ] Owner menu and Urdu publication approval (menu content itself is structurally verified complete — see `scripts/validate` — this is a sign-off/translation task, not a content-completeness task).
- [ ] Vector/transparent logo and approved photo set.
- [ ] Staff accounts, roles, response/status procedures, MFA ownership.
- [ ] Tax/service-charge and collection-payment rules.
- [ ] Booking/treehouse/event operational details.
- [ ] Privacy, retention/deletion, consent, and legal wording.
- [ ] English/Urdu Vapi real-speaker bake-off.

## Completed

- [x] Research assets and verified operating knowledge collected.
- [x] Menu transcribed and structurally validated.
- [x] Architecture/data model/release gates Version 2 created.
- [x] Claude Code master prompt and gated runbook Version 2 created.
- [x] Legacy contradictions reconciled/deprecated.
- [x] Token-efficient context ledger and source router introduced.
- [x] Step 1 — baseline audit (facts, contradictions, media/gate risk register recorded).
- [x] Step 2 — ADRs 0001–0008 recorded under `cladium-research/architecture/adr/`.
- [x] Step 3 — deterministic validation tooling (`scripts/validate/`) added and run: full PASS; corrected the Step 1 menu-count bug; generated the owner sign-off report.
- [x] Local baseline committed (`8732db0`, not pushed) — research pack, governance, ADRs, validator tooling, placeholder-only `.env.example`.
- [x] Step 4 — Next.js App Router/TypeScript-strict scaffold: install, format, lint, typecheck, unit tests, source validators, and production build all pass; no business features built.
- [x] Step 5 — CI and repository hygiene: GitHub Actions mirrors the local verification chain; secret and client-bundle scans, contribution guidance, protected-branch recommendations, and dependency-update policy added. Full verification passes.
- [x] Step 6 — shared schemas and error conventions: strict boundary parsing, typed results/errors, correlation IDs, redacted structured logs, safe responses, and client/server environment separation. Full verification passes (102 unit tests).
- [x] Step 7 — Supabase local config, migration/generated-types workflow, environment-isolation docs, offline connection-routing check. Local `db reset` smoke passed (exit 0, PostgreSQL 17.6); reduced-stack command documented for low-memory Docker. No hosted project linked.
- [x] Step 8 — core content schema: 4 migrations, 12 tables, integer-PKR + timestamptz + version triggers, tri-state availability, approval-gated publishing, RLS enabled (default-deny) everywhere. Generated types committed. `db reset` clean, `db:test:schema` passes, offline migration lint in `verify`.
- [x] Step 9 — workflow schema: 4 migrations, 16 tables (28 total). Three state machines enforced by trigger, append-only history, immutable snapshot lines, single-use confirmation tokens, idempotency and webhook dedupe uniqueness, deferred staff FKs. `conversation_summaries` intentionally not created. `db reset` clean, schema tests pass.
- [x] Step 10 — RLS/grants/MFA policy: 3 migrations (helpers, policies, grants) covering all 28 tables; five staff roles plus anon/guest; `staff_requiring_mfa` and `public_business_settings` views; allow/deny matrix (`scripts/db/rls-tests.sql`) and offline migration lint (`scripts/db/migration-invariants.mjs`) added. `db reset` clean, `npm run db:test` (schema + RLS) and full `npm run verify` pass.

## Update rule

Keep only actionable work here. Move completed items to the short Completed list; put rationale in `DECISIONS.md`, not in task descriptions. After any completed runbook step, refresh the step-completion snapshot (overall/phase, as percentages — not effort) in `PROJECT_STATE.md`'s `## Progress` section; see `CLAUDE.md` Workflow rules for the rule itself.
