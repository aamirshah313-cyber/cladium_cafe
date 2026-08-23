# Cladium compact project state

Updated: 2026-08-23  
Architecture: Version 2  
Phase: pre-build, Runbook Phase 0 (Steps 1–3 done)  
Application code: not started

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

## Next

1. Review this state and `.continuum/TASKS.md`.
2. Before app scaffolding (Step 4), commit/back up the currently untracked research pack.
3. Runbook Step 4: scaffold the Next.js App Router application.

## Production blockers

Owner-approved menu/Urdu publication signoff (menu content itself is now structurally verified complete — 118 items, 12 categories, no empty categories); vector/transparent logo and 20–40 licensed photos; primary phone and staff roles/workflows; tax/service charges and collection-payment rules; booking/event rules; privacy/retention/consent wording; real-speaker bilingual Vapi bake-off; business-owned Meta/WhatsApp configuration for later flagged integrations.

## Load next, not everything

Read root `CLAUDE.md`, `.continuum/TASKS.md`, and `cladium-research/architecture/context-routing-v2.md`. Load only the task-specific sources it names. Never paste the full menu, raw command output, or whole runbook into context unless the active step requires it.
