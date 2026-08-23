# Cladium production architecture v2

Status: **authoritative build architecture**  
Target: Next.js on Vercel Pro, Supabase Pro, Anthropic text concierge, Vapi browser voice  
Launch languages: English and Urdu  
Launch themes: Day and Night

This document refines the existing Cladium research. It does not replace the approved menu, business facts, brand direction, carousel study, or operating knowledge.

## 1. Honest launch scope

Cladium's launch is a request-and-confirmation service, not instant commerce. The system does not have a live kitchen-capacity, table-inventory, payment, or delivery source of truth.

Approved public actions:

- **Start Takeaway Request**
- **Request a Table**
- **Request Treehouse Seating**
- **Plan a Birthday**
- **Ask Cladium Concierge**
- **Continue on WhatsApp**

Do not publish **Place Order**, **Book Now**, **Check Availability**, **Purchase**, or equivalent promises until the relevant live service and owner-approved workflow exist. Every submitted request remains pending until staff acts on it.

Launch includes menu discovery, a takeaway-request cart, table/treehouse requests, event enquiries, a protected staff workspace, English/Urdu text concierge, English/Urdu browser voice, Google Maps directions, click-to-WhatsApp, and consent-aware analytics.

Launch excludes home delivery, accommodation booking, automatic table availability, automatic event quotation, online payment, autonomous refunds, autonomous booking/order confirmation, and a public telephone voice line. These may only be enabled later through feature flags after separate approval and testing.

## 2. Chosen stack

| Concern | Production choice |
| --- | --- |
| Web application | Next.js App Router, TypeScript strict mode, React Server Components by default |
| Hosting | Vercel Pro; Node.js runtime for database, secrets, signatures, and webhooks |
| Database/auth/storage/realtime | Supabase Pro with PostgreSQL, Auth, Storage, Realtime, RLS, backups, and MFA |
| Text concierge | Anthropic Messages API through server-only routes and strict tools |
| Browser voice | Vapi Web SDK using short-lived public JWTs and separate English/Urdu assistants |
| Styling | Semantic design tokens, CSS logical properties, accessible Day/Night modes |
| Validation | Shared Zod schemas at every untrusted boundary |
| Testing | Vitest, Testing Library, Playwright, axe, contract tests, agent evals, voice test matrix |
| Observability | Vercel logs/metrics plus structured redacted application events and error tracking |

Keep business logic provider-neutral. Vercel, Supabase, Anthropic, Vapi, WhatsApp, and Meta integrations live behind typed adapters so providers can change without rewriting the domain layer.

## 3. System shape

```text
Browser / mobile guest
  ├─ server-rendered /en and /ur public pages
  ├─ accessible menu list + optional carousel client island
  ├─ request review and explicit confirmation screens
  ├─ text concierge
  ├─ Vapi Web SDK (short-lived, restricted JWT)
  └─ click-to-WhatsApp
             │ HTTPS
             ▼
Next.js on Vercel Pro
  ├─ locale pages and server components
  ├─ guest session + CSRF/origin/rate-limit boundary
  ├─ deterministic menu, pricing, request, and status services
  ├─ Anthropic orchestration with strict tools
  ├─ Vapi token, tool, and webhook routes
  ├─ protected staff APIs and dashboard
  ├─ WhatsApp/Meta adapters behind feature flags
  └─ outbox dispatcher and scheduled retry work
             │ private server connection
             ▼
Supabase Pro
  ├─ PostgreSQL + RLS
  ├─ staff authentication + MFA
  ├─ Storage for approved media
  ├─ Realtime staff updates
  └─ backups, migrations, audit, idempotency, and outbox tables
```

## 4. Application boundaries

Use one deployable Next.js application initially. Organize it by domain rather than by page:

```text
src/
  app/
    [locale]/                 # public English/Urdu routes
    staff/                    # authenticated role-aware workspace
    api/                      # thin validated transport handlers
  modules/
    business/                 # hours, location, contact and policy
    menu/                     # adapter, browsing, variants and price calculations
    takeaway/                 # cart, review, confirmation and state transitions
    bookings/                 # table/treehouse requests and state transitions
    events/                   # birthday/event enquiries and quotations
    concierge/                # policy, orchestration, tools and eval fixtures
    voice/                    # Vapi profiles, token issuance, tools and webhooks
    staff/                    # roles, workflows and audit views
    integrations/             # Supabase, Anthropic, Vapi, WhatsApp and Meta adapters
    consent/                  # preference, marketing, microphone and recording consent
  lib/                        # shared primitives only
```

Route handlers validate/authenticate, call a domain service, and serialize a response. They do not contain pricing, status, permissions, or prompt logic.

## 5. Request workflows

Takeaway, booking, and event workflows are distinct state machines. Their exact states and transactional rules are defined in `data-model-v2.md`.

Core guarantees:

1. The client may build a draft but cannot directly write a requested or confirmed record.
2. The server recomputes menu lines and integer-PKR totals from the published menu version.
3. The guest sees a final review summary and explicitly confirms submission.
4. An expiring, single-use confirmation token is bound to the guest session, action, and review hash.
5. A client-generated idempotency key prevents duplicate submissions.
6. Submitted line items snapshot names, variants, quantities, and prices so later menu edits do not rewrite history.
7. Staff changes use allowed transitions, role checks, optimistic versioning, and immutable status/audit events.
8. Public messages say **request received** until an authorized staff transition says otherwise.

## 6. Menu and content governance

`data/menu.json` remains source material and is imported through a normalizer. The database copy is versioned and publishable; the JSON file is not read as mutable production storage.

Each runtime menu entity has a stable ID, locale-aware text, publish state, explicit availability state (`AVAILABLE`, `UNAVAILABLE`, or `UNKNOWN`), source reference, version, and source checksum. Prices are integer PKR. Unknown availability is never converted to unavailable or available.

The public site uses owner-approved media only. The reference video informs interaction, not shipped artwork. With only one authentic venue photograph and JPG logos currently available, a transparent/vector logo and a larger approved photo set are launch-quality dependencies.

## 7. English, Urdu, and themes

- Use explicit `/en/...` and `/ur/...` routes, server-rendered metadata, `hreflang`, and `x-default`.
- Urdu pages set `lang="ur"` and `dir="rtl"`; layout uses logical CSS properties.
- Locale and theme preferences use small, non-sensitive cookies so server rendering matches the first paint.
- Never publish invented Urdu translations of authoritative business facts. Use owner-reviewed Urdu or a clearly controlled canonical-English fallback.
- Day/Night mode uses semantic tokens and never mutates content or workflow state. Avoid automatic mid-session theme changes.
- The carousel is a progressive enhancement. The searchable, keyboard-accessible, server-rendered menu list remains the primary discovery surface. No autoplay.

## 8. Concierge architecture

The text and voice experiences share the same policy, data services, tools, confirmation gates, and request state. The model does not receive or reproduce an embedded 118-item menu on every turn.

Flow:

```text
guest message/audio
  → authenticated guest session + locale
  → compact system policy + relevant state
  → model chooses a strict tool when facts/actions are needed
  → server validates and executes deterministic domain service
  → model explains the verified result
  → visible review UI + guest tap for any write
```

Rules:

- `getMenu` and business-data tools are the source of factual menu, price, hours, and policy answers.
- Tool JSON schemas use strict validation and reject unknown properties.
- Browser-supplied chat history is untrusted. The server maintains bounded state associated with a signed, HttpOnly session.
- Write tools cannot bypass the review-hash confirmation token and idempotency checks.
- The orchestration loop has tool-call, token, and time limits plus a safe staff/WhatsApp fallback.
- The assistant never diagnoses allergies or guarantees allergens; it asks staff for uncertain or safety-sensitive questions.
- Prompt-injection text in guest input, menu fields, or retrieved content cannot alter system policy or tool authorization.

## 9. Vapi browser voice

Use two independently configured and evaluated Vapi assistant profiles: English and Urdu. The locale selector chooses the profile; code-switched and Roman Urdu input still need explicit testing.

Security flow:

1. The browser requests `POST /api/vapi/token` after origin, rate-limit, feature-flag, and session checks.
2. The server signs a short-lived Vapi public JWT restricted to the permitted origin and selected assistant ID.
3. No long-lived Vapi private credential or unrestricted public key is shipped in `NEXT_PUBLIC_*` variables.
4. Vapi calls `POST /api/vapi/tools`. Authenticate it with a Vapi Custom Credential using HMAC-SHA256, validate timestamp freshness, compare signatures in constant time, and reject replays.
5. Deduplicate tool calls using Vapi `toolCallId`; invoke only the same domain services available to text chat.
6. Voice may prepare a draft and summarize it. Final submission requires the visible website review plus an explicit tap. Voice alone cannot confirm availability, price exceptions, payment, or staff decisions.
7. Recording is disabled by default. If later enabled, collect separate recording consent and publish retention/deletion rules first.

Use server-held environment-specific assistant IDs and signing credentials. English and Urdu profiles may use different speech/transcription providers after an evidence-based bake-off; do not hard-code a provider before evaluation.

## 10. Staff operations

Supabase Auth protects staff routes. Initial roles:

- `OWNER`
- `MANAGER`
- `ORDER_STAFF`
- `BOOKING_STAFF`
- `AUDITOR`

The owner and managers require MFA. Enforce authorization in both API services and PostgreSQL RLS; hiding UI controls is not authorization. Every material state change records actor, timestamp, reason, previous/new state, request version, and correlation ID.

The staff dashboard subscribes to Supabase Realtime for fast updates, but Realtime is not the delivery guarantee. A transactional outbox records notification work in the same transaction as the request. An authenticated dispatcher retries delivery and records terminal failures for staff attention.

## 11. WhatsApp and Meta

Launch click-to-chat using the official WhatsApp number. Keep Cloud API automation disabled until the business-owned WABA, templates, webhook verification, escalation ownership, opt-in/opt-out behavior, and staff response process are approved.

Meta marketing is a separate feature flag and consent category. For the request-only launch, allowed event semantics include:

- `view_menu`
- `add_to_cart`
- `submit_order_request`
- `submit_booking_request`
- `submit_event_request`
- `contact` or `lead`

Do not emit `purchase` or `booking_confirmed` from a guest submission. If browser Pixel and Conversions API report the same event, generate one shared event ID for deduplication. Never send names, phone numbers, free-form notes, audio, chat content, or other PII to analytics/Meta.

## 12. Security, privacy, and abuse controls

- Separate consent for essential preference storage, Meta marketing, microphone access, and any future recording.
- Publish an owner-approved privacy notice and retention schedule before production. Hide unavailable legal/social-proof pages rather than publishing placeholders.
- Classify data and minimize collection. Raw audio and full conversation logs are not retained by default; store only purpose-limited summaries when justified.
- Apply CSP, HSTS, frame restrictions, Referrer-Policy, Permissions-Policy, secure cookies, CSRF protection, origin checks, schema validation, body limits, rate limits, and bot/spam controls.
- Verify all Vapi, Supabase, WhatsApp, and Meta webhook signatures, timestamps, and event IDs. Store dedupe outcomes without secrets or PII.
- Redact logs. Never place API keys, access tokens, contact fields, chat text, or request notes in analytics or exception metadata.
- Run dependency, secret, authorization, injection, replay, duplicate-submission, and abuse tests in CI/staging.

## 13. Environments and deployment

Use isolated development, preview/staging, and production Supabase projects/credentials, Vapi assistants, Anthropic keys, feature flags, URLs, and webhook secrets. Preview must never write to production.

Choose the Supabase database region first. Place Vercel functions near it (Mumbai is a likely candidate only if the selected Supabase project is in Mumbai). Use the Supabase transaction pooler for serverless requests and a direct/session connection only where migrations require it.

Protect the main branch. CI must pass lint, formatting, typecheck, unit, integration, contract, migration, accessibility, and critical policy tests before deployment. Apply production migrations through a guarded release job, verify health, then promote. Keep the previous deployment and backward-compatible migration path available for rollback.

## 14. Feature flags

All environment-scoped and server-authoritative:

- `PUBLIC_SITE`
- `TAKEAWAY_REQUESTS`
- `BOOKING_REQUESTS`
- `EVENT_REQUESTS`
- `TEXT_CONCIERGE`
- `VOICE_EN`
- `VOICE_UR`
- `WHATSAPP_CLOUD`
- `META_MARKETING`
- `ONLINE_PAYMENT`

Disabled features do not expose functional routes or misleading controls. `ONLINE_PAYMENT`, `WHATSAPP_CLOUD`, and any delivery capability start disabled.

## 15. Production quality targets

- WCAG 2.2 AA for both languages, both themes, keyboard, screen reader, reduced motion, and zoom.
- P75 Core Web Vitals targets: LCP below 2.5 seconds, INP below 200 milliseconds, CLS below 0.1.
- Critical agent-policy evaluations must pass 100%: no delivery, no invented price/availability, no unauthorized confirmation, correct décor policy, and reliable handoff.
- Voice must be tested with real Pakistani English and Urdu speakers on mobile in quiet/noisy conditions, including code switching, item names, prices, and corrections.
- Request creation, status transitions, notification retries, webhook replay, idempotency, backup restore, rollback, and owner UAT must pass the release gates.

## 16. Source-of-truth order

When documents disagree, use this order:

1. owner-confirmed business facts in `data/business-profile.json` and `agent/approved-operations-knowledge.md`;
2. this production architecture and `data-model-v2.md`;
3. `operations/release-gates-v2.md`;
4. current design, localization, theme, carousel, and brand specifications;
5. Version 2 Claude Code prompt/runbook;
6. older blueprints and legacy runbooks as historical context only.
