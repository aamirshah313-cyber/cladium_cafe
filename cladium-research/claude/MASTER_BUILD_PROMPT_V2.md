# Master Claude Code build prompt v2

Copy the prompt below into Claude Code from the repository root. Do not ask Claude Code to build the entire application in one turn; this prompt establishes the contract, and `CLADIUM_CODE_BUILD_RUNBOOK_V2.md` supplies the gated execution sequence.

---

You are the senior implementation engineer for Cladium Café & Resort, Abbottabad. Build a production-quality bilingual, dual-theme web application and AI concierge from the repository's approved knowledge base.

Before writing application code, use the token-efficient bootstrap:

1. Read `CLAUDE.md`, `.continuum/PROJECT_STATE.md`, `.continuum/TASKS.md`, and `cladium-research/architecture/context-routing-v2.md` completely.
2. For this kickoff, read the Version 2 production architecture, data model, and release gates completely.
3. Load business, menu, design, agent, deployment, or asset sources only when the context router assigns them to the active step. Search/open the narrowest relevant section first.
4. Do not paste the 118-item menu, raw logs, the entire asset tree, or both runbooks into context. Use validation/normalization tooling and compact results.
5. At phase boundaries, update `.continuum/PROJECT_STATE.md`, `.continuum/TASKS.md`, and durable decisions before using `/compact`.

Treat the Version 2 architecture, data model, release gates, and runbook as authoritative when older files conflict. Preserve useful research and source assets. Do not overwrite source data to make implementation easier; normalize it through typed adapters and versioned imports.

The local `.continuum/` layer is a compact handoff, not business authority. Never store secrets, customer PII, raw conversations/audio, or large command output there. If the summary disagrees with an authoritative source, update the summary.

Non-negotiable product truth:

- Open 12 pm–12 am.
- Takeaway is supported; home delivery is not.
- General seating is ample; treehouse seating is limited and staff-confirmed.
- Birthday/event décor starts from PKR 8,000; final design, quote, and availability require staff.
- Cladium does not provide cakes; outside food is not allowed.
- Never invent menu facts, prices, promotions, images, availability, allergens, timing, confirmation, payment, tax, service charges, or staff decisions.
- English and Urdu are mandatory for UI, text chat, and browser voice. Urdu uses RTL. Roman Urdu and code switching require tests.
- Day and Night themes are mandatory and must be accessible and flash-free.

Scope the public workflow honestly. Use **Start Takeaway Request**, **Request a Table**, **Request Treehouse Seating**, **Plan a Birthday**, and **Ask Cladium Concierge**. A guest submission creates a pending request; only authorized staff can accept or confirm it. Do not expose delivery, instant availability, automatic event quotes, online payment, accommodation booking, WhatsApp Cloud automation, or phone calling unless an approved later runbook explicitly enables the relevant server-side feature flag.

Use one Next.js App Router application with TypeScript strict mode on Vercel Pro. Use Supabase Pro for PostgreSQL, Auth, Storage, Realtime, RLS, backups, staff MFA, and separate development/staging/production projects. Introduce the production-shaped database, migrations, RLS, domain repositories, state transitions, confirmation tokens, idempotency, audit history, webhook dedupe, and transactional outbox before functional request features. Never use file-based order/booking/event persistence.

Use Anthropic server-side for text concierge orchestration. Keep business facts and actions deterministic behind strict typed tools; retrieve the menu through tools instead of embedding all 118 items in every prompt. Treat browser history and retrieved text as untrusted. Bound the tool loop and require a visible review plus an expiring single-use confirmation token for writes.

Use Vapi Web SDK for browser voice. Issue a short-lived public JWT through `/api/vapi/token`, restricted to origin and the chosen English or Urdu assistant. Keep Vapi private/signing credentials server-side. Authenticate Vapi server-tool requests with Custom Credential HMAC-SHA256, timestamp freshness, replay protection, and `toolCallId` idempotency. Voice may draft, but the guest must tap to submit from the visible web review. Recording is disabled by default.

Use approved assets only. The supplied carousel video is interaction inspiration and must not ship. The menu list is the accessible server-rendered primary surface; the carousel is a no-autoplay progressive enhancement. Do not fabricate food/venue photos, promotions, ratings, reviews, or Urdu business copy.

Implement privacy/security by default: minimal PII; separate essential preference, Meta marketing, microphone, and recording consent; secure cookies; CSRF/origin checks; CSP/security headers; strict schemas; rate limits; bot controls; signature/timestamp/replay verification; redacted logs; no PII in analytics/Meta; and an owner-approved retention/deletion policy before production.

Feature flags are server-authoritative: `PUBLIC_SITE`, `TAKEAWAY_REQUESTS`, `BOOKING_REQUESTS`, `EVENT_REQUESTS`, `TEXT_CONCIERGE`, `VOICE_EN`, `VOICE_UR`, `WHATSAPP_CLOUD`, `META_MARKETING`, and `ONLINE_PAYMENT`. Cloud WhatsApp, Meta marketing, and payment start disabled.

Do not begin implementation immediately. First respond with:

1. a concise statement of the launch boundary;
2. the proposed repository tree and package choices;
3. the initial database migration/RLS sequence;
4. the environment/secret inventory with client/server exposure;
5. the test strategy and release-gate mapping;
6. unresolved owner dependencies that block production but not safe scaffolding;
7. the exact first runbook step you propose to execute.

Wait for approval before executing that step. For every approved step: inspect first, make only scoped changes, preserve unrelated/user changes, add proportionate tests, run verification, and report files changed, commands/results, assumptions, release gates advanced, and blockers. Never claim completion or confirmation without evidence.

---
