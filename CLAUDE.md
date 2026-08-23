# Cladium Café & Resort - Claude Code instructions

## Project purpose

Build a luxury, mobile-first web application and AI concierge for **Cladium Café & Resort, Abbottabad**. It must support menu discovery, takeaway order requests, table/limited-treehouse booking requests, birthday/event enquiries, and staff/WhatsApp handoff.

## Token-efficient session bootstrap

At the start of a session, read this file, `.continuum/PROJECT_STATE.md`, `.continuum/TASKS.md`, and `cladium-research/architecture/context-routing-v2.md`. Then load only the authoritative sources routed for the active runbook step. Do not preload the full menu, asset tree, legacy runbook, or unrelated design/agent/deployment documents.

- Search first and open the smallest relevant file/section.
- Use deterministic scripts for counts/schema checks instead of copying large JSON into the prompt.
- Keep one active runbook step and summarize command output to evidence, errors, counts, and paths.
- At each phase boundary, update `.continuum/PROJECT_STATE.md` and `.continuum/TASKS.md`; append only durable rationale to `.continuum/DECISIONS.md`.
- Keep the compact state below roughly 700 words. Never store secrets, credentials, customer PII, raw conversations/audio, or large logs in `.continuum/`.
- `.continuum/` is a lower-authority summary. If it conflicts with verified source data or Version 2 specifications, correct the summary from the authoritative source.

## Read before modifying code

These files are the authoritative knowledge base. Preserve them; do not replace or flatten them with generic sample data.

- `cladium-research/data/business-profile.json`
- `cladium-research/data/menu.json`
- `cladium-research/agent/approved-operations-knowledge.md`
- `cladium-research/architecture/production-architecture-v2.md`
- `cladium-research/architecture/data-model-v2.md`
- `cladium-research/operations/release-gates-v2.md`
- `cladium-research/brand/visual-direction.md`
- `cladium-research/design/menu-carousel-reference.md`
- `cladium-research/design/localization-and-rtl.md`
- `cladium-research/design/theme-mode.md`
- `cladium-research/architecture/product-blueprint.md`
- `cladium-research/architecture/deployment-target.md`
- `cladium-research/architecture/context-routing-v2.md`
- `cladium-research/design/site-map.md`
- `cladium-research/assets/provided/`
- `cladium-research/claude/MASTER_BUILD_PROMPT_V2.md`
- `cladium-research/claude/CLADIUM_CODE_BUILD_RUNBOOK_V2.md`

When older documents conflict with the Version 2 architecture, data model, release gates, or runbook, Version 2 wins. The older master prompt and runbook are retained for traceability and must not drive a new build.

## Non-negotiable operating rules

- Open 12 pm–12 am.
- Takeaway is available. Home delivery is not currently available; never expose, accept, or promise it.
- General seating is ample. Treehouse capacity is limited and must be staff-confirmed.
- Birthday/event décor starts from PKR 8,000; final quote and availability require staff confirmation.
- The café does not provide cakes. Outside food is not allowed.
- Never invent menu items, prices, promotions, allergies, availability, pickup times, booking confirmations, payment status, tax rates, service-charge rates, or staff decisions.

## Implementation rules

- Use TypeScript and keep business logic deterministic. The AI may converse and call tools; it must never calculate prices or decide operational facts itself.
- Preserve `data/menu.json` as source material. Implement a normalizer/adapter for the runtime rather than rewriting the existing data shape.
- Do not create fictional promotions. An empty promotion configuration is correct until the owner supplies approved promotions.
- Introduce production-shaped PostgreSQL migrations, RLS, repositories, state machines, idempotency, audit history, and a transactional outbox before building functional request flows. Never persist orders, bookings, or events in files.
- Keep all credentials in server-side environment variables. Never commit `.env`, API keys, Meta tokens, or WhatsApp credentials.
- Production hosting target is Vercel Pro with Next.js and Supabase Pro. Keep the application portable; do not introduce Netlify-specific runtime code or configuration unless the deployment target is deliberately changed.
- Vapi is the voice provider. Launch browser voice using short-lived origin- and assistant-restricted public JWTs issued by `/api/vapi/token`; never ship a long-lived production Vapi credential in `NEXT_PUBLIC_*`. Authenticate Vapi tools/webhooks with HMAC-SHA256, timestamp replay protection, and `toolCallId` idempotency. Phone-number calling is a later, separately approved carrier/SIP integration.
- The text and voice concierge must use the same approved knowledge, tool contracts, deterministic totals, customer-confirmation gates, and staff-confirmation rules.
- English and Urdu are mandatory launch languages for both the interface and concierge audio/text. Implement locale routing, a visible language switcher, Urdu RTL layout, and separately tested English/Urdu speech recognition and voice output according to `design/localization-and-rtl.md`.
- Day and Night themes are mandatory. Implement the accessible persistent theme control and semantic color tokens in `design/theme-mode.md`; theme changes must never alter logo artwork, price data, cart/booking state, or language choice.
- Never machine-invent or silently publish Urdu translations for authoritative menu names, descriptions, policies, promotions, or legal content. Keep canonical approved text until an owner-reviewed Urdu translation is stored; preserve tool-supplied names, quantities, prices, and policy meaning exactly in both text and audio.
- Require explicit customer confirmation before saving an order request. Require staff confirmation before calling an order, booking, treehouse request, or event request confirmed.
- Use separate takeaway, booking, and event state machines from `architecture/data-model-v2.md`. Store immutable request line snapshots and append-only status/audit history.
- Make customer data collection minimal, validate all inputs, and provide clear WhatsApp staff handoff.
- Maintain accessible keyboard navigation, WCAG AA contrast, responsive layouts, error states, and tests for business rules.
- Treat the uploaded menu-reference video as interaction inspiration only. Do not copy its name, food images, copy, watermark, layout artwork, or branding. Implement the approved Cladium adaptation in `design/menu-carousel-reference.md` only when the runtime menu adapter and approved media mapping are available.
- Use request-accurate CTAs: **Start Takeaway Request**, **Request a Table**, **Request Treehouse Seating**, **Plan a Birthday**, and **Ask Cladium Concierge**. Do not promise instant ordering, booking, availability, purchase, or payment.
- Keep `WHATSAPP_CLOUD`, `META_MARKETING`, `ONLINE_PAYMENT`, delivery, accommodation, recording, and public phone voice disabled until their release gates are separately approved.
- Never publish placeholder legal pages, promotions, reviews, ratings, social proof, or invented imagery/content.

## Workflow rules

- Work one Version 2 runbook prompt at a time. Complete and verify only that task before moving on.
- Do not change unrelated files. Report assumptions, blockers, and verification results after each step.
- Check context at each phase boundary; first update the compact `.continuum/` handoff, then compact only at a phase boundary while preserving the active architecture/version, verification, changes, blockers, and next step.
- Treat every item in `operations/release-gates-v2.md` as mandatory evidence or an explicitly disabled/deferred feature before deployment.
