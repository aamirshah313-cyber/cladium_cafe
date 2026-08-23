# Production release gates v2

Status: **mandatory launch checklist**  
Rule: a gate is either evidenced as passed, explicitly deferred behind a disabled feature flag, or launch is blocked.

## Gate 0 — owner decisions and rights

- [ ] The owner has approved the transcribed menu names, variants, and prices.
- [ ] The owner has selected the primary public phone number and confirmed the official WhatsApp number.
- [ ] Tax and service-charge rates and when they apply are documented; if unresolved, the product does not calculate or promise them.
- [ ] Takeaway acceptance, preparation, pickup, rejection, cancellation, and staff notification procedures are documented.
- [ ] Table and treehouse request confirmation, decline, cancellation, no-show, and capacity ownership are documented.
- [ ] Birthday/event enquiry, quote, confirmation, cancellation, décor, cake, and outside-food wording are approved.
- [ ] Privacy notice, retention/deletion schedule, consent copy, terms if required, and customer-support wording are owner/legal reviewed.
- [ ] Rights and consent exist for every public logo, photograph, video, testimonial, rating, and social embed.
- [ ] A transparent or vector official logo and a representative owner-approved photo library are supplied. Until then, avoid fabricated food/venue imagery and treat media quality as a launch blocker.
- [ ] Urdu public translations and Urdu/English pronunciation rules are reviewed by fluent speakers and the owner.

## Gate 1 — scope and truthful UX

- [ ] Public CTAs consistently say request/enquiry, not instant order, booking, availability, or purchase.
- [ ] Home delivery, accommodation booking, online payment, automatic availability, Cloud API messaging, and public phone voice are absent or disabled.
- [ ] Treehouse seating and all bookings are visibly staff-confirmed.
- [ ] Décor wording says starts from PKR 8,000 and final quote/availability requires staff.
- [ ] No placeholder promotions, reviews, legal pages, social proof, food photography, or unsupported policies are public.
- [ ] Feature flags remove disabled controls and reject direct calls to disabled routes.

## Gate 2 — content and menu integrity

- [ ] All eight supplied menu-page assets are represented in the source manifest and import checksum.
- [ ] The normalized menu has stable item/variant IDs, categories, integer PKR prices, version, publish status, and tri-state availability.
- [ ] Import validation finds no duplicate stable IDs, invalid/missing prices, orphan variants, or silent source omissions.
- [ ] The public menu reads only the owner-approved published version.
- [ ] Submitted takeaway lines snapshot name, variant, unit price, quantity, and total.
- [ ] No assistant/UI path invents promotions, images, translations, allergens, or availability.

## Gate 3 — database, authentication, and authorization

- [ ] Development, staging/preview, and production use isolated Supabase projects and secrets.
- [ ] Production uses Supabase Pro with the correct region, SSL, backups, and a tested restore procedure.
- [ ] Serverless application traffic uses the transaction pooler; migration connectivity is separately controlled.
- [ ] RLS is enabled and tested for every exposed table/view.
- [ ] Staff roles are enforced in both service logic and RLS.
- [ ] Owner/manager MFA is enforced.
- [ ] State transitions, optimistic versioning, audit events, confirmation tokens, idempotency, webhook dedupe, and the outbox are database-backed and tested.
- [ ] Preview deployments cannot read or write production data.

## Gate 4 — request workflow reliability

- [ ] Takeaway, booking, and event states exactly follow `architecture/data-model-v2.md`.
- [ ] Submission requires a visible review and a single-use confirmation token bound to the review hash.
- [ ] Server recomputation detects stale/changed menu pricing and asks the guest to review again.
- [ ] Duplicate clicks, retries, timeouts, and Vapi duplicate tool calls return the same safe result.
- [ ] Unauthorized and invalid state transitions fail closed and leave an audit trail.
- [ ] Request creation and notification-outbox creation are atomic.
- [ ] Realtime updates improve dashboard speed, while outbox retry/terminal failure handling provides reliability.

## Gate 5 — concierge policy and safety

- [ ] Text and voice use the same approved knowledge, strict tools, deterministic services, and confirmation rules.
- [ ] The current menu is retrieved via tools; it is not copied into every system prompt.
- [ ] Client-supplied history, retrieved content, menu copy, and tool results are treated as untrusted data.
- [ ] Tool loop, token, request-size, timeout, and rate limits have safe fallbacks.
- [ ] Critical policy evals pass 100% in English, Urdu script, and Roman Urdu: no delivery; no invented prices/availability; no false confirmation/payment; correct hours/location; correct event policy; human handoff.
- [ ] Adversarial prompt-injection, cross-session data exposure, unauthorized tool use, and PII leakage tests pass.
- [ ] Allergy/safety queries use cautious approved language and staff escalation.

## Gate 6 — Vapi bilingual voice

- [ ] English and Urdu use separate environment-specific assistant IDs and independently tested voice/transcriber settings.
- [ ] `/api/vapi/token` returns only a short-lived public JWT bound to approved origin and assistant ID, with session/rate-limit checks.
- [ ] No Vapi private key or unrestricted long-lived browser key appears in client code or build output.
- [ ] Vapi tool/webhook routes verify HMAC-SHA256, timestamp freshness, replay state, and `toolCallId` idempotency.
- [ ] Voice drafts require a visible web summary and explicit tap before submission.
- [ ] Recording is disabled. If it is ever enabled, a separate recording-consent and retention gate must pass first.
- [ ] Real Pakistani speakers test English, Urdu, Roman Urdu/code switching, numbers, PKR prices, menu names, accents, interruptions, corrections, noisy mobile audio, denied microphone, timeouts, and human handoff.
- [ ] The selected speech stack meets owner-approved comprehension/latency quality; choice is based on the bake-off, not a default assumption.

## Gate 7 — localization, theme, accessibility, and performance

- [ ] `/en` and `/ur` pages are server-rendered with correct `lang`, `dir`, canonical, `hreflang`, and `x-default` metadata.
- [ ] Locale and theme persist without hydration flash, open redirects, or cross-locale state corruption.
- [ ] English/Urdu × Day/Night × mobile/tablet/desktop Playwright matrix passes.
- [ ] WCAG 2.2 AA checks pass for keyboard, focus, contrast, screen reader, zoom, reduced motion, validation, and RTL order.
- [ ] Gold-on-ivory or other low-contrast combinations are decorative only, not body text or essential controls.
- [ ] Menu browsing works without the carousel; carousel has no autoplay and is keyboard/touch accessible.
- [ ] P75 targets are measured in staging/production telemetry: LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
- [ ] Images are responsive, licensed, correctly sized, and have reviewed English/Urdu alt text where appropriate.

## Gate 8 — privacy, security, and integrations

- [ ] CSP, HSTS, Referrer-Policy, Permissions-Policy, frame restrictions, secure cookies, CSRF/origin validation, body limits, input validation, rate limits, and bot/spam controls are verified.
- [ ] Essential preferences, Meta marketing, microphone, and recording consent are distinct.
- [ ] Logs, analytics, Meta, and exception tracking contain no names, phone numbers, notes, audio, chat content, keys, or tokens.
- [ ] Secret scanning, dependency scanning, authorization tests, injection tests, webhook spoof/replay tests, and abuse tests pass.
- [ ] Click-to-WhatsApp uses the verified business number and avoids exposing customer data in a prefilled URL unless the guest explicitly chooses it.
- [ ] WhatsApp Cloud remains off until WABA ownership, templates, signature verification, opt-in/opt-out, retention, and staff response operations pass review.
- [ ] Meta remains off until consent and privacy controls pass. Events use request semantics, and browser/CAPI duplicate events share an event ID.

## Gate 9 — deployment and operations

- [ ] Vercel Pro project, custom domain, DNS, TLS, environment isolation, spending alerts, WAF/rate rules, and production access roles are configured.
- [ ] Vercel function region is close to the chosen Supabase database region.
- [ ] CI passes lint, format, typecheck, unit, integration, contract, migration, E2E, accessibility, agent-policy, and security suites.
- [ ] Protected main branch and reviewed migration/release jobs are configured.
- [ ] Health checks, structured redacted logs, error alerting, outbox failure alerts, API/voice cost alerts, and runbooks are operational.
- [ ] Backup restore and application rollback drills succeed with documented recovery objectives.
- [ ] Load/concurrency tests cover menu traffic, request spikes, chat, Vapi token issuance, staff transitions, and outbox retries.
- [ ] Owner/staff UAT passes on real mobile devices in English/Urdu and Day/Night modes.
- [ ] A named launch owner, incident contact, rollback decision-maker, and post-launch monitoring window are recorded.

## Launch decision

Production launch is permitted only when Gates 0–9 have evidence and every deferred capability is disabled server-side. Record evidence links, approver, date, tested commit, database migration version, menu version, Vapi assistant versions, and deployed Vercel URL in the release record.
