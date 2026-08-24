# Cladium compact project state

Updated: 2026-08-24
Architecture: Version 2  
Phase: Runbook Phases 0 and 1 complete (Steps 1–6); Step 7 complete incl. local smoke; Step 10 (RLS/grants/MFA policy) complete
Application code: scaffolded (Next.js App Router, TypeScript strict) with CI gates and shared platform primitives — no business features built yet
Baseline commit: `8732db0` "chore: establish Cladium pre-build baseline" (local only, not pushed). Steps 8–10 are complete in the working tree but **not yet committed** — see Next.

## Progress (step-completion metrics, not effort estimates)

- Overall: 10/47 runbook steps = 21.3%
- Phase 0 (governance/evidence, steps 1–3): 3/3 = 100%
- Phase 1 (repo/app foundation, steps 4–6): 3/3 = 100%
- Phase 2 (data/auth/security, steps 7–12): 4/6 = 66.7%
- No public website exists yet: that is Phase 3 (steps 13–18), and deployment is step 46.
- Every step counts equally regardless of size/duration. See `CLAUDE.md` Workflow rules for the reporting rule.

## Goal

Build a luxury, mobile-first Cladium Café & Resort web application on Next.js/Vercel Pro with Supabase Pro, request-based takeaway/table/treehouse/event workflows, protected staff operations, English/Urdu text and browser voice concierge, Urdu RTL, Day/Night themes, click-to-WhatsApp, and consent-gated Meta support.

## Current truth

- Open 12 pm–12 am; takeaway yes; home delivery no.
- Requests are pending until staff acts. Never promise instant order, availability, booking, payment, or confirmation.
- Treehouses are limited/staff-confirmed.
- Birthday décor starts PKR 8,000; no cakes are provided; outside food is not allowed.
- Menu source (`data/menu.json`) verified by `scripts/validate/run-all.mjs`: 118 items across 12 categories, 100 single-price, 18 variant-price, zero missing prices, eight source pages, zero empty categories. (The Step 1 audit's "52 items / 4 empty categories" figure was a bug in that step's ad hoc script, which missed items nested under `groups[].items` in Steaks/Burgers/Bar Menu/BBQ — see D-015. The original 118-item figure was correct.) Owner publication signoff remains required.
- Vapi browser voice uses separate English/Urdu assistants, short-lived origin/assistant-restricted JWTs, HMAC/replay protection, and visible tap confirmation. Recording is off.

## Completed

- Production architecture v2 and data model v2.
- Mandatory production release gates.
- Claude Code master prompt v2 and 47-step gated runbook.
- Legacy contradictions corrected or marked historical.
- Start-here handoff and structural/data validation.
- Local token-efficient context/checkpoint layer added because the supplied CONTINUUM GitHub repository is not publicly accessible.
- Runbook Step 1 baseline audit complete: confirmed business facts, source-of-truth precedence, media inventory, gate risk register recorded.
- Runbook Step 2 ADRs recorded at `cladium-research/architecture/adr/0001`–`0008` (stack, request-only scope, bilingual routing, Day/Night tokens, server-side Anthropic tools, Vapi JWT/HMAC, transactional outbox, provider adapters).
- Runbook Step 3 deterministic, dependency-free validation tooling added at `scripts/validate/` (`node --test "scripts/validate/**/*.test.mjs"` and `node scripts/validate/run-all.mjs`); current run is a full PASS with zero errors/warnings, and it corrected the Step 1 menu-count bug (see above and D-015). Generates `cladium-research/data/validation/owner-signoff-report.md`.
- Local baseline committed (`8732db0`): the full pre-build research pack, governance files, ADRs, and validator tooling — 66 files, no real secrets, `.env.example` placeholders only. Not pushed to any remote.
- Runbook Step 4 scaffold: Next.js 16.3.2 App Router, React 19.2.8, TypeScript 6.0.3 strict, npm (not pnpm — pnpm unavailable in this environment, deviating from ADR-0001's proposal; npm used instead, package-lock.json committed-ready), ESLint 9 (flat config, `eslint-config-next` + `eslint-config-prettier`), Prettier, Vitest, Zod-based client/server/feature-flag env schema at `src/lib/env.ts`, and `src/modules/*` boundary directories (business/menu/takeaway/bookings/events/concierge/voice/staff/integrations/consent) per `production-architecture-v2.md` §4. No business features, no locale routing, no API routes yet — those are later steps. Clean install, format check, lint, typecheck, unit tests (8/8), source validators, and `next build` all pass.

- Runbook Step 5 CI and repository hygiene: `.github/workflows/ci.yml` (Node 24) runs install integrity (`npm ci`), `npm ls`, format, lint, typecheck, unit tests, source validators, scripts tests, secret scan, production build, and a client-bundle leak check — the same chain as `npm run verify`, runnable locally. Added dependency-free `scripts/security/` scanner (12 patterns, never prints matched values) plus `CONTRIBUTING.md` (commands, branch-protection recommendations, dependency-update policy incl. the ESLint 9 pin rationale). `.gitignore` and placeholder-only `.env.example` reviewed and already safe — unchanged. CI consumes no repository secrets and builds without credentials by design.
- Runbook Step 6 shared platform primitives: strict shared request schemas and boundary parsing, typed `Result`/application errors, correlation IDs, redacted structured logging, safe JSON responses, and synthetic test fixtures. Client-safe environment handling is isolated in `src/lib/env.ts`; privileged environment handling is isolated in `src/lib/env.server.ts` and rejects browser imports at module load. Full 11-gate verification passes (102 unit tests), including validation, redaction, response-safety, and environment-boundary tests.
- Runbook Step 7 complete: local `supabase/config.toml`, migration workflow, generated-types workflow, isolated environment guidance, transaction-pooler/direct-connection invariants, and an offline CI check. **Local smoke passed**: `supabase db reset` → exit 0 ("Finished supabase db reset"), PostgreSQL 17.6 verified queryable, `public` schema empty (correct pre-Step-8). Docker here is 4 GB, too small for all 11 services (containers OOM-killed, `exit 137`); the reduced stack `supabase start -x studio,edge-runtime,realtime,storage,imgproxy,supavisor,mailpit,vector,logflare` is stable and sufficient for the migration workflow — documented in `docs/database-environments.md`, not worked around in committed config. Fixed the `[inbucket]`→`[local_smtp]` deprecation. No hosted project connected; stack stopped afterwards.

- Runbook Step 8 core content schema: 4 migrations (`20260824120001`–`4`) creating 12 tables — business settings/hours/exceptions, feature flags, menu versions/categories/items/variants, translations, media assets, pricing rules, promotions. Integer-PKR money, `timestamptz` UTC, `version` + `updated_at` trigger on every row, tri-state availability defaulting to UNKNOWN, composite FKs so items/variants cannot straddle menu versions, at most one published menu version, and approval-required constraints on publishing (menu version, media, promotions) and on active pricing rules / enabled flags / approved translations. RLS enabled on all 12 tables with no policies yet = default-deny; policies are Step 10. `pricing_rules` and `promotions` are intentionally empty. Generated types committed at `src/lib/db/database.types.ts`. Evidence: `db reset` applies all 4 cleanly from scratch, `npm run db:test:schema` passes (accepts valid content, rejects invalid prices/states), offline migration lint added to `npm run verify`.

- Runbook Step 9 workflow schema: 4 further migrations (`20260824130001`–`4`), 16 more tables — staff profiles/role memberships, customer sessions, carts/cart items, confirmation tokens, idempotency keys, takeaway requests + immutable snapshot items, booking requests, event requests, status events, audit events, outbox events, webhook events, consent events. The three state machines are enforced by database trigger as well as in code: guest submissions may only be created in their initial state, and only listed transitions are legal. Snapshot lines and the status/audit/consent ledgers are append-only by trigger. `total = subtotal + adjustments` and `line_total = unit_price × quantity` are check constraints. Confirmation tokens are terminal once used; idempotency scope and `(provider, provider_event_id)` are unique; an unverified webhook cannot be marked processed. `conversation_summaries` deliberately NOT created (optional, and unapproved). Deferred FKs from Step 8 to `staff_profiles` added. 28 tables total, all RLS-enabled (default-deny). Evidence: `db reset` applies all 8 migrations cleanly; `npm run db:test:schema` passes with ~40 assertions.
- Runbook Step 10 authorization: 3 further migrations (`20260824140001`–`3`) — `rls_helpers` (SECURITY DEFINER helpers: `current_customer_session_id`, `current_staff_id`, `is_staff`, `staff_has_role`, `is_owner_or_manager`, `is_published_menu_version`, avoiding RLS recursion on `staff_profiles`), `rls_policies` (every one of the 28 tables gets explicit policies: anonymous public-read of published/approved content only, guest access scoped to `app.customer_session_id` set per-transaction by the server, and five staff roles — OWNER, MANAGER, ORDER_STAFF, BOOKING_STAFF, AUDITOR — with least-privilege reads/writes; AUDITOR is read-only by omission), `grants` (table-level GRANTs layered under the policies; `confirmation_tokens`/`idempotency_keys` have no client grant at all — service_role only — and neither do `feature_flags`/`pricing_rules`/`audit_events`/`staff_profiles` for `anon`, which denies at the privilege layer rather than filtering rows). Added a `staff_requiring_mfa` view (owner/manager in scope) and a `public_business_settings` view for anonymous-safe settings. New allow/deny matrix at `scripts/db/rls-tests.sql` (`npm run db:test:rls`) exercises anon, two independent guests, all five staff roles, and service_role. New offline (no-Docker) migration lint at `scripts/db/migration-invariants.mjs` (filenames/ordering, every created table gets RLS enabled, no unacknowledged destructive DDL, money columns are integer, timestamps are `timestamptz`) wired into `npm run verify`. Evidence: `db reset` applies all 11 migrations cleanly; `npm run db:test` (schema + RLS) passes; full `npm run verify` passes (48 unit tests + build + scans). One test/grant mismatch was found and fixed in this session: `rls-tests.sql` originally expected `anon` to get an empty result set (RLS-level filtering) on tables that in fact have no GRANT to `anon` at all (`feature_flags`, `pricing_rules`, `confirmation_tokens`, `audit_events`, and `staff_profiles` as seen from a guest session) — Postgres correctly raises `insufficient_privilege` instead. Added a `pg_temp.expect_no_access()` test helper for that case; no migration/policy/grant changed, only the test's expectation.

## Next

1. Review this state and `.continuum/TASKS.md`.
2. **Commit Steps 8–10** (currently uncommitted in the working tree: 11 migrations, generated types, `scripts/db/*-tests.sql`, `scripts/db/migration-invariants.*`, and the small config/doc updates that go with them) — not done automatically; ask before committing.
3. Runbook Step 11 (menu normalization and import into an unpublished version).
4. Note for later: full-stack local work (Studio/Storage/Realtime/Edge Functions) needs Docker raised to ~7 GB; the migration workflow itself does not.

## Production blockers

Owner-approved menu/Urdu publication signoff (menu content itself is now structurally verified complete — 118 items, 12 categories, no empty categories); vector/transparent logo and 20–40 licensed photos; primary phone and staff roles/workflows; tax/service charges and collection-payment rules; booking/event rules; privacy/retention/consent wording; real-speaker bilingual Vapi bake-off; business-owned Meta/WhatsApp configuration for later flagged integrations.

## Load next, not everything

Read root `CLAUDE.md`, `.continuum/TASKS.md`, and `cladium-research/architecture/context-routing-v2.md`. Load only the task-specific sources it names. Never paste the full menu, raw command output, or whole runbook into context unless the active step requires it.
