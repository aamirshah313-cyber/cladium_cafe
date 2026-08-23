# Cladium Claude Code build runbook v2

Status: **authoritative execution sequence**  
Execution rule: run one numbered step at a time and approve the next step only after its evidence is reviewed.

Start Claude Code in the repository root, paste `MASTER_BUILD_PROMPT_V2.md`, review its pre-build response, then use the prompts below. Do not paste the whole runbook at once.

At every step Claude must preserve existing work, show changed files, run the stated checks, identify assumptions/blockers, and stop. Begin from `.continuum/PROJECT_STATE.md` and use `architecture/context-routing-v2.md` to load only task-relevant sources. At each phase boundary update the compact state/task/decision ledger, then use `/context`. Use `/compact` only at a phase boundary when context is crowded; include the active architecture version, completed steps, verification, uncommitted changes, blockers, and next step. Do not paste the full menu, asset list, runbook, or raw logs into handoffs.

## Phase 0 — governance and evidence

### 1. Baseline audit

> Read the compact session bootstrap and the Version 2 architecture/data/release core. Use the context router, targeted searches, and deterministic counts to inspect other sources without preloading every file or asset. Inspect repository status and available assets without changing files. Return: confirmed business facts, contradictions, missing owner inputs, media limitations, source-of-truth precedence, a compact file-tree summary, and a gate-by-gate build risk register. Update the compact state only at the phase boundary. Do not scaffold yet.

Evidence: no unintended changes; all blockers mapped to `release-gates-v2.md`.

### 2. Architecture decision records

> Create concise ADRs for the chosen Next.js/Vercel/Supabase architecture, request-only scope, bilingual routing, Day/Night rendering, server-side Anthropic tools, Vapi JWT/HMAC model, transactional outbox, and provider adapters. Record rejected alternatives and reversible boundaries. Do not add application dependencies.

Evidence: ADRs match Version 2 documents; no promise of delivery/payment/instant confirmation.

### 3. Data and asset validation tooling

> Add read-only validation scripts/tests for `business-profile.json`, `menu.json`, source asset references, duplicate/stable identifiers, price shapes, and required facts. Define an owner signoff report. Do not alter source meaning or fabricate missing values.

Evidence: all source files parse; all eight menu pages are accounted for; unknowns remain explicit.

## Phase 1 — repository and application foundation

### 4. Scaffold the application

> Scaffold a current stable Next.js App Router TypeScript-strict application in this repository without overwriting research. Use a maintainable package manager lockfile, ESLint, formatting, import aliases, environment-schema validation, and the module boundaries in `production-architecture-v2.md`. Do not build business features.

Evidence: clean install, lint, typecheck, unit smoke test, production build.

### 5. Continuous integration and repository hygiene

> Add CI for install integrity, format check, lint, typecheck, unit tests, JSON/source validation, secret scanning, and production build. Add safe `.gitignore`, `.env.example` with placeholders only, contribution commands, protected-branch recommendations, and dependency update policy.

Evidence: CI runs locally where possible; no real secret appears in source/build output.

### 6. Shared schemas and error conventions

> Implement shared Zod schemas, typed results/errors, correlation IDs, redacted structured logging, server/client environment boundaries, safe response helpers, and test fixtures. Reject unknown input fields at trust boundaries.

Evidence: unit tests cover validation, redaction, and client/server environment separation.

## Phase 2 — production-shaped data, auth, and security

### 7. Supabase projects and migration workflow

> Add Supabase local development configuration, migration commands, generated type workflow, and documented isolated development/staging/production setup. Use transaction-pooler application configuration and a separately controlled migration connection. Do not connect production credentials during this step.

Evidence: local/reset migration workflow succeeds; environment docs match Vercel/Supabase separation.

### 8. Core content schema

> Create tested migrations for business settings/hours, feature flags, menu versions/categories/items/variants/translations/media, pricing rules, and promotions exactly as defined in `data-model-v2.md`. Add constraints, indexes, publish rules, tri-state availability, and integer-PKR enforcement.

Evidence: clean migration and upgrade fixture pass; invalid prices/states are rejected.

### 9. Workflow schema

> Create tested migrations for customer sessions, carts/items, confirmation tokens, idempotency keys, takeaway requests/snapshot items, booking requests, event requests, status events, staff roles/profiles, audit events, outbox events, webhook events, consent events, and optional summaries disabled by default.

Evidence: foreign keys, uniqueness, expiry, versioning, and retention indexes verified.

### 10. RLS, authentication, and roles

> Implement Supabase RLS and service authorization for public published reads, session-owned guest reads, and role-scoped staff access. Add OWNER, MANAGER, ORDER_STAFF, BOOKING_STAFF, and AUDITOR permissions. Require owner/manager MFA in the documented deployment policy.

Evidence: automated allow/deny matrix passes across anonymous, guest A/B, each staff role, and service worker.

### 11. Menu normalization and import

> Implement a typed adapter that imports existing menu JSON into an unpublished menu version with stable IDs, source checksum, source references, variants, integer prices, translations workflow, and UNKNOWN availability. Preserve the JSON as source evidence. Add a diff/signoff report and publish operation restricted to owner/manager.

Evidence: all 118 source items reconcile; price/variant totals match; repeated import is idempotent; nothing auto-publishes.

### 12. Security foundation

> Add secure session cookies, CSRF and origin verification, security headers/CSP, request/body limits, central rate-limit and abuse interfaces, safe form handling, safe redirect utilities, webhook verification primitives, and log redaction. Use durable production adapters and explicit development substitutes.

Evidence: security unit/integration tests cover forged origin/CSRF, unsafe redirects, oversized bodies, replay, bad signatures, and redaction.

## Phase 3 — bilingual, dual-theme public experience

### 13. Locale routing and reviewed content model

> Implement server-rendered `/en` and `/ur` routing, locale negotiation without open redirects, `lang`/`dir`, metadata, canonical/hreflang/x-default, visible switcher, and signed/safe preference persistence. Integrate reviewed translations with canonical-English fallback; never invent public Urdu copy.

Evidence: routing/SEO/RTL tests pass; language changes preserve cart and do not alter facts/IDs/prices.

### 14. Day/Night design system

> Implement semantic design tokens and accessible Day/Night themes from the approved specifications, including server-aligned initial render, preference control, focus/reduced-motion states, and unchanged official logo artwork. Treat low-contrast gold as decorative only.

Evidence: no theme flash; contrast and theme persistence tests pass in both locales.

### 15. Public shell and navigation

> Build the mobile-first site shell, accessible navigation, footer, business-status/hours display, skip links, loading/error/not-found states, and request-accurate CTA language. Hide unavailable routes and placeholder legal/social proof.

Evidence: keyboard/screen-reader smoke tests and responsive screenshots for locale/theme matrix.

### 16. Home, location, and contact

> Build truthful home, location, directions, contact, and policy surfaces using approved facts/assets only. Use the official map link and click-to-WhatsApp. Do not imply accommodation, delivery, fabricated reviews, or unavailable food photography.

Evidence: source-fact assertions and external-link/security tests pass.

### 17. Accessible menu browsing

> Build the server-rendered searchable/filterable menu with categories, items, variants, explicit availability state, and integer-PKR formatting. Do not publish unreviewed Urdu translations, allergens, or images. Ensure full functionality without JavaScript enhancement.

Evidence: all published records render accurately; keyboard, screen-reader, RTL, and no-JS tests pass.

### 18. Menu carousel enhancement

> Implement the approved menu carousel as a small client island inspired only by the reference study. Use CSS transforms, touch/keyboard controls, reduced motion, no autoplay, and no copied third-party artwork. It must never replace or hide the accessible list.

Evidence: touch, keyboard, resize, reduced-motion, and performance tests pass.

## Phase 4 — deterministic requests and staff workflows

### 19. Domain repositories and state machines

> Implement provider-neutral repositories/services for menu, carts, takeaway, bookings, events, status transitions, confirmation tokens, idempotency, audit, and outbox. Encode the three separate state machines exactly. No route or AI tool may write around them.

Evidence: exhaustive transition/role/optimistic-lock unit tests pass.

### 20. Takeaway draft and review

> Build session-owned cart, variant/quantity edits, server recomputation, stale-menu handling, contact/pickup-detail validation, and a bilingual final review. Use request language and show that staff acceptance/timing are pending.

Evidence: cross-session access, price tampering, stale menu, invalid quantity, and locale/theme persistence tests pass.

### 21. Takeaway submission

> Implement review-hash confirmation-token issuance and idempotent transactional submission to REQUESTED with snapshot lines, status/audit event, and outbox notification. A repeated identical submission returns the original result; a changed payload is rejected.

Evidence: concurrency, double-click, retry, rollback, and atomicity integration tests pass.

### 22. Booking and treehouse requests

> Build table/treehouse request forms, validation, review token, idempotent REQUESTED submission, and pending-staff language. Never expose a fabricated availability check. Surface limited treehouse capacity and staff confirmation.

Evidence: state, authorization, date/time, party-size, duplicate, locale, and accessibility tests pass.

### 23. Birthday and event enquiries

> Build event enquiry/request flow with approved décor/cake/outside-food wording, review/confirmation, and the event state machine. Only staff can quote and confirm.

Evidence: no automatic quote/confirmation; policy and transition tests pass.

### 24. Protected staff workspace

> Build role-aware queues and detail views for takeaway, booking, and event work. Add allowed transitions, assignment, version-conflict handling, mandatory reasons where needed, safe search/filtering, and append-only history.

Evidence: role/RLS/UI authorization matrix and concurrent-transition tests pass.

### 25. Notifications and outbox dispatcher

> Implement Supabase Realtime for dashboard freshness and an authenticated, concurrency-safe outbox dispatcher with retry/backoff, idempotent handlers, terminal-failure visibility, and redacted telemetry. Do not rely on an open dashboard for delivery.

Evidence: worker overlap, crash/retry, poison message, and terminal alert tests pass.

## Phase 5 — text concierge

### 26. Concierge policy and read tools

> Implement a compact cached system policy and strict read tools for menu, business facts, policies, promotions, and request status. Do not embed the entire menu in the prompt. Treat retrieved content as data and preserve exact IDs/prices.

Evidence: strict-schema contract tests and factual English/Urdu/Roman Urdu evals pass.

### 27. Server-side chat orchestration

> Implement authenticated/rate-limited server chat with bounded server-held conversation state, tool/token/time limits, safe errors, streaming if justified, redacted telemetry, and WhatsApp/staff fallback. Browser history is untrusted and cannot authorize actions.

Evidence: cross-session, prompt injection, loop exhaustion, timeout, PII-log, and cost-limit tests pass.

### 28. Concierge draft actions and confirmation

> Add strict tools that prepare takeaway/booking/event drafts through domain services. The assistant may present a structured review but cannot submit directly. Submission requires the same visible UI and single-use review token as manual flows.

Evidence: all bypass/duplicate/tampering attempts fail; manual/text workflows produce equivalent records.

### 29. Agent evaluation harness

> Convert and expand acceptance tests into an automated versioned evaluation suite for English, Urdu script, Roman Urdu, ambiguity, injection, prices, policies, availability, confirmation, handoff, and tool selection. Fail CI on any critical-policy regression.

Evidence: critical suite passes 100%; non-critical threshold and review process documented.

## Phase 6 — Vapi bilingual browser voice

### 30. Vapi configuration as controlled artifacts

> Define environment-specific English and Urdu assistant configuration templates, shared policy/tool schema versions, change logs, and a deployment procedure. Keep provider/voice/transcriber choices configurable until the real-speaker bake-off.

Evidence: assistant IDs/config versions cannot cross environments; secrets are server-only.

### 31. Short-lived browser token service

> Implement `/api/vapi/token` to issue a short-lived Vapi public JWT after feature-flag, origin, session, locale/assistant allowlist, and rate-limit checks. Do not ship a long-lived public or private Vapi key in the client bundle.

Evidence: wrong origin/assistant/locale, expiry, replay/abuse, and client-bundle secret tests pass.

### 32. Authenticated Vapi tools and webhooks

> Implement Vapi tool/webhook routes with Custom Credential HMAC-SHA256 verification, timestamp freshness, constant-time comparison, replay rejection, `toolCallId` idempotency, strict payload schemas, bounded execution, and redacted logging.

Evidence: valid, invalid, stale, replayed, duplicate, malformed, and timeout cases pass.

### 33. Voice web experience

> Add accessible microphone permission/start/stop/status/error UI, English/Urdu assistant selection, transcript review where permitted, and visible draft summary. Voice alone cannot submit; guest tap uses the standard confirmation flow. Recording stays disabled.

Evidence: denied permission, device loss, disconnect/reconnect, locale/theme/RTL, keyboard, and duplicate tool tests pass.

### 34. Voice quality bake-off

> Create and execute a scored test plan with real Pakistani English/Urdu speakers across quiet/noisy mobile conditions, code switching, Roman Urdu, menu names, prices, dates, numbers, corrections, interruption, latency, and handoff. Recommend voice/transcriber profiles from measured results; do not guess.

Evidence: recordings require test-participant consent; scores, failures, selected profiles, and owner acceptance are documented.

## Phase 7 — WhatsApp and Meta

### 35. Click-to-WhatsApp handoff

> Harden the official click-to-WhatsApp handoff with clear consent and minimal prefilled non-sensitive context. Provide staff escalation copy in both languages. Do not enable Cloud API automation.

Evidence: number/link verified by owner; no PII is silently placed in URLs/analytics.

### 36. Consent and privacy controls

> Implement separate consent records/UI for essential preferences, Meta marketing, microphone, and future recording. Add owner-approved privacy/retention/deletion content and data-subject operational procedures. Hide unapproved legal pages.

Evidence: grant/revoke, locale/theme, analytics blocking, deletion/retention job, and versioned-policy tests pass.

### 37. Meta measurement behind a flag

> Implement consent-gated Meta adapter events for view_menu, add_to_cart, submit_order_request, submit_booking_request, submit_event_request, and contact/lead. Share event IDs between browser and CAPI for dedupe. Never send PII. Keep `META_MARKETING` disabled until owner verification.

Evidence: consent-denied sends nothing; request events never emit purchase/booking confirmation; dedupe and PII tests pass.

### 38. Optional WhatsApp Cloud readiness

> Produce a readiness report and disabled adapter scaffold only. Require business-owned WABA, approved templates, signature verification, webhook dedupe, opt-in/opt-out, retention, cost, escalation, and staff ownership before enabling `WHATSAPP_CLOUD`.

Evidence: flag-off routes fail closed; no production messages are sent in this step.

## Phase 8 — full hardening

### 39. Cross-product E2E and accessibility

> Run Playwright and axe across English/Urdu, Day/Night, mobile/tablet/desktop, menu, manual requests, chat, voice shell, WhatsApp handoff, staff roles, errors, reduced motion, zoom, keyboard, and screen reader landmarks. Fix verified failures within scope.

Evidence: matrix report with artifacts and no critical accessibility defect.

### 40. Security and abuse verification

> Run authorization, RLS, CSRF/origin, XSS/injection, SSRF where relevant, request smuggling assumptions, webhook spoof/replay, rate-limit, spam, prompt injection, dependency, secret, and client-bundle scans. Remediate critical/high issues or block launch.

Evidence: signed report linked to tested commit and environment.

### 41. Performance and resilience

> Test production-like menu traffic, request spikes, chat, Vapi token/tool calls, staff transitions, Realtime interruption, outbox retries, provider timeouts, and database contention. Optimize toward the documented Core Web Vitals and capacity targets without weakening correctness.

Evidence: results, budgets, bottlenecks, failure behavior, and alert thresholds documented.

### 42. Backup, restore, and rollback drill

> Restore a staging database from backup, verify critical records and RLS, rehearse application rollback and backward-compatible database behavior, and document recovery objectives and operators.

Evidence: timed drill passes; gaps block production.

## Phase 9 — staging, UAT, and production

### 43. Staging release

> Deploy to isolated staging using production-like configuration but no production data/credentials. Verify region, pooler, migrations, security headers, flags, webhooks, assistant IDs, analytics disabled state, observability, cost alerts, and smoke tests.

Evidence: staging URL, commit, migration/menu/assistant versions, and smoke report recorded.

### 44. Owner and staff UAT

> Guide owner/staff through the release-gate UAT on real devices: bilingual content, themes, menu accuracy, request wording, takeaway/booking/event operations, roles, notification failures, concierge policy, voice quality, WhatsApp link, privacy, and rollback contacts. Record explicit approvals and unresolved blockers.

Evidence: signed owner content/operations/voice approval and role-specific staff acceptance.

### 45. Production readiness decision

> Evaluate every checkbox in `release-gates-v2.md` against evidence. Produce a go/no-go report. Any unmet non-deferred gate is NO-GO; any deferred capability must be disabled server-side. Do not deploy during this step.

Evidence: approver, tested commit, artifacts, known risks, rollback decision-maker, and launch window recorded.

### 46. Controlled production deployment

> Only after an approved GO: apply guarded migrations, deploy the tested commit to Vercel Pro, verify domain/TLS/headers/region/pooler/secrets/flags, publish the approved menu version, run production smoke tests without fake operational records, and monitor errors, latency, outbox, abuse, and costs. Roll back on defined stop conditions.

Evidence: production release record and health snapshot.

### 47. Post-launch verification

> Monitor the agreed launch window, review real anonymized funnel/reliability signals, confirm staff response handling, reconcile outbox/webhook errors, collect consented voice failures without retaining unnecessary content, and create a prioritized follow-up list. Do not enable deferred features as a shortcut.

Evidence: post-launch report, incidents/actions, and owner handoff.

## Change-control rule after launch

Delivery, online payment, automatic availability, public phone voice, recording, WhatsApp Cloud automation, new promotions, new taxes/charges, accommodation, or autonomous confirmations each require a new approved architecture change, data/privacy review, tests, feature flag, staged rollout, and owner signoff.
