# Cladium compact project state

Updated: 2026-08-24
Architecture: Version 2  
Phase: Runbook Phases 0 and 1 complete (Steps 1–6); Step 7 configuration foundation implemented, local-stack smoke pending
Application code: scaffolded (Next.js App Router, TypeScript strict) with CI gates and shared platform primitives — no business features built yet
Baseline commit: `8732db0` "chore: establish Cladium pre-build baseline" (local only, not pushed)

## Progress (step-completion metrics, not effort estimates)

- Overall: 6/47 runbook steps = 12.8%
- Phase 0 (governance/evidence, steps 1–3): 3/3 = 100%
- Phase 1 (repo/app foundation, steps 4–6): 3/3 = 100%
- Phase 2 (data/auth/security, steps 7–12): 0/6 = 0%
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
- Runbook Step 7 configuration foundation: local `supabase/config.toml`, empty migration workflow, generated-types workflow, isolated environment guidance, transaction-pooler/direct-connection invariants, and CI check added. Full `npm run verify` passes (102 unit tests, 35 script tests). The local Supabase reset smoke remains pending because Docker is installed but the Supabase CLI is not available in this environment; no hosted project was connected.

## Next

1. Review this state and `.continuum/TASKS.md`.
2. Complete the Runbook Step 7 local `db:start`/`db:reset` smoke once the Supabase CLI is available; no hosted project should be connected.

## Production blockers

Owner-approved menu/Urdu publication signoff (menu content itself is now structurally verified complete — 118 items, 12 categories, no empty categories); vector/transparent logo and 20–40 licensed photos; primary phone and staff roles/workflows; tax/service charges and collection-payment rules; booking/event rules; privacy/retention/consent wording; real-speaker bilingual Vapi bake-off; business-owned Meta/WhatsApp configuration for later flagged integrations.

## Load next, not everything

Read root `CLAUDE.md`, `.continuum/TASKS.md`, and `cladium-research/architecture/context-routing-v2.md`. Load only the task-specific sources it names. Never paste the full menu, raw command output, or whole runbook into context unless the active step requires it.
