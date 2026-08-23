# Cladium Café & Resort — Research Pack

This folder is the single, source-tracked reference for creating Cladium Café & Resort's website, ordering flow, booking experience, chatbot, and marketing integrations.

For a new build, begin with the repository-root `BUILD_START_HERE.md` and `CLAUDE.md`.

## What has been verified

- Business name: **Cladium Café & Resort**
- City: Abbottabad, Pakistan
- Core positioning: elevated mountain escape; serenity, café, resort; premium dining for families; panoramic mountain views; aesthetic experience.
- Instagram handle: `@cladium.cafe` — 1,792 followers, 258 posts (public-profile metadata, 21 August 2026).
- Facebook profile: `Cladium.Cafe&Resort | Abbottabad` — 691 likes and 1,722 people talking about the Page (public-profile metadata, 21 August 2026).
- Opening hours stated on Instagram: 12 pm–12 am.

## Folder guide

- `assets/official-profile/` — official profile image, kept solely as a design reference.
- `data/business-profile.json` — structured verified facts and their sources.
- `data/menu.json` — structured menu, prices, portions, and signature tags transcribed from the supplied menu artwork.
- `brand/visual-direction.md` — preliminary brand system drawn from official copy and the profile mark.
- `architecture/production-architecture-v2.md` — authoritative production scope, services, security, deployment, Vapi, and integration architecture.
- `architecture/data-model-v2.md` — authoritative database, state-machine, transaction, idempotency, and outbox contracts.
- `architecture/context-routing-v2.md` — minimal task-to-source map for lower token/context use.
- `architecture/product-blueprint.md` — earlier product overview, retained as supporting context.
- `claude/implementation-brief.md` — concise implementation overview.
- `claude/MASTER_BUILD_PROMPT_V2.md` — authoritative Claude Code kickoff prompt; it requires a plan before code changes.
- `claude/CLADIUM_CODE_BUILD_RUNBOOK_V2.md` — authoritative 47-step gated build, test, staging, and production sequence.
- `claude/MASTER_BUILD_PROMPT.md` and `claude/CLADIUM_CODE_BUILD_RUNBOOK.md` — legacy references only; do not use to start a new build.
- `operations/release-gates-v2.md` — mandatory evidence checklist for production launch.
- `.continuum/` at repository root — compact project state, tasks, decisions, and handoff protocol shared by Claude Code/Codex.
- `operations/launch-decisions.md` — owner decisions required before orders, bookings, chat, or Meta integrations can go live.
- `agent/approved-operations-knowledge.md` — owner-representative-confirmed answers and chatbot guardrails.
- `agent/system-prompt-draft.md` — the production-ready behavioral base for the concierge system prompt.
- `agent/tool-contracts.md` — server-side tool interfaces and request state rules.
- `agent/acceptance-tests.md` — mandatory concierge behavior tests before public launch.
- `design/site-map.md` — the page hierarchy and conversion journey.
- `data/collection-checklist.md` — the owner-access materials needed to complete the pack accurately.

## Important data rule

The supplied artwork is retained under `assets/provided/` as a local source copy; the originals remain at their supplied location. Menu transcription, current availability, charges, and booking operations still require owner signoff before they are published or automated. Home delivery is confirmed as unavailable; delivery configuration is future-only and must remain disabled at launch.

## Source date

Initial public-source capture: 21 August 2026, Asia/Karachi.
