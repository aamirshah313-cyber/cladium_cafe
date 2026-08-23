# Cladium Café Claude Code build runbook

> **Legacy reference only.** Do not execute this sequence for a new build. Use `CLADIUM_CODE_BUILD_RUNBOOK_V2.md`, which moves the database/security foundation forward and adds production release gates.

This adapts the 38-step CafeBot reference into a Cladium-specific sequence. Run **one numbered prompt at a time** in Claude Code. Each prompt assumes `CLAUDE.md` and the `cladium-research/` folder are present. Do not skip verification or replace the existing knowledge base.

## Context discipline

- Run `/context` after prompts 5, 10, 15, 20, 25, 30, and 35.
- Commit and run `/compact` after prompts 6, 12, 17, 22, 27, 31, 34, and 36.
- Run `/clear` only when starting a separate work session, never in the middle of a phase.

## Phase 1 - foundation and luxury frontend

### 1. Inspect and prepare the project structure

> Read `CLAUDE.md` and inspect `cladium-research/` completely. Create only the minimal application folders needed for a TypeScript web app, backend/API, tests, and documentation. Keep `cladium-research/` unchanged and do not write the site or application logic yet. Report the proposed structure and stop.

### 2. Validate project instructions

> Review the existing root `CLAUDE.md`. Improve it only if a rule is missing or contradictory. Preserve all Cladium business rules, source-of-truth references, security requirements, and non-delivery policy. Do not write application code.

### 2a. Establish locale and theme foundations

> Read `design/localization-and-rtl.md` and `design/theme-mode.md`. Set up the minimum typed foundation for English (`en`), Urdu (`ur`), Day, and Night before public UI work: locale routing, translation catalog mechanism, document `lang`/`dir`, semantic theme tokens, and persistent user preferences. Do not translate or rewrite menu/business source data; create only the safe UI scaffold and report the owner-reviewed Urdu translation queue.

### 3. Build the public Cladium frontend

> Build the responsive Cladium Café & Resort landing page using the supplied logo and approved venue imagery. Implement header/navigation, cinematic hero, brand story, signature menu preview sourced from the existing menu data, visit/location section, hours, official WhatsApp action, footer, accessible English/Urdu language switcher, and Day/Night theme control. Follow the brand, site-map, localization, and theme specifications. Do not add chat, ordering, booking logic, unapproved Urdu business-content translations, or fabricated imagery. Stop after the frontend is complete.

### 4. Add a mock concierge widget

> Add an accessible floating Cladium Concierge chat widget to the existing site. It must work on mobile and desktop, show customer messages immediately, and return this fixed mock reply: “Welcome to Cladium Café & Resort. I’ll be ready to help with the menu, takeaway, visits, and bookings soon.” Do not call an API yet.

### 5. Audit the responsive frontend

> Review English/Urdu and Day/Night frontend states and mock concierge for visual defects, RTL/order/focus problems, keyboard/accessibility problems, mobile layout issues, contrast failures, and console errors. Fix only confirmed defects. Do not add product features.

### 6. Create the first checkpoint

> Add/update `.gitignore` to exclude dependencies, environment files, build outputs, local order data, and OS/editor files. Do not ignore the Cladium research pack. Prepare the exact local Git commands for a checkpoint named `FEAT: Cladium luxury frontend and mock concierge`; do not push or alter any remote configuration.

## Phase 2 - backend foundation

### 7. Define environment variables

> Create `.env.example` with placeholders only for `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`, `VAPI_PRIVATE_KEY`, `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, and future Meta/WhatsApp configuration. Include comments that private keys are Vercel server-only and Vapi public keys must be origin- and assistant-restricted. Ensure `.env` is ignored. Do not create a real `.env` or server code.

### 8. Set up the server shell

> Create the minimal TypeScript backend/API project required to serve the existing frontend and load environment variables. Install only necessary dependencies. Do not add chat, data writes, authentication, or external API calls yet. Verify the server starts cleanly.

### 9. Create a safe empty chat endpoint

> Add a POST `/api/chat` endpoint accepting `message` and bounded `conversationHistory`. Validate missing/oversized input, return a placeholder JSON reply, and add a safe error response. Do not call an AI API yet.

## Phase 3 - grounded concierge

### 10. Create the Cladium system prompt

> Create `prompts/cladium-concierge-system.md` by grounding it in `agent/system-prompt-draft.md`, `business-profile.json`, `menu.json`, `approved-operations-knowledge.md`, and `design/localization-and-rtl.md`. Preserve the draft's strict operating guardrails, then require truthful English, Urdu-script, and Roman-Urdu responses; takeaway-only behaviour; staff confirmation for bookings/events; explicit localized confirmation before order persistence; and refusal/escalation for unknowns. Do not change application code.

### 11. Connect the AI provider

> Update only `/api/chat` to call the Claude Messages API using the current recommended Anthropic SDK/model documented at implementation time. Load the system prompt server-side, keep keys secret, bound history and output, and provide a friendly fallback. Do not modify the frontend.

### 12. Connect the chat widget

> Update only the concierge UI so it sends messages to `/api/chat` with the current locale, renders English/Urdu safely with correct direction, shows a typing state, handles network failures, and preserves a bounded local conversation history. Verify a real English and Urdu round trip.

## Phase 4 - data and order state

### 13. Create a runtime menu adapter

> Do not replace `cladium-research/data/menu.json`. Create a typed adapter that derives stable IDs and a flat runtime menu while preserving its categories, groups, variants, prices, quantities, and source names. Represent unknown descriptions, allergens, customizations, and availability as explicitly unconfigured; do not invent them.

### 14. Create safe promotions configuration

> Create an empty, typed promotions configuration with validation and an `active` flag. Do not add example, fictional, or inferred promotions. The concierge must only use owner-approved active promotions.

### 15. Create development-only request storage

> Create development-only local storage schemas for order requests, booking requests, and event requests. Include a conspicuous production warning. Do not add a database or persist any real customer information.

### 16. Ground the concierge in approved data

> Update `/api/chat` so approved Cladium data and the runtime menu are available as grounding context without exposing secrets or unbounded files. The assistant must never invent menu items, prices, promotions, availability, or operating policies.

### 17. Create request state models

> Add session-based typed state for cart, takeaway request, booking request, and birthday/event request. Use explicit states: `DRAFT`, `AWAITING_CUSTOMER_CONFIRMATION`, `REQUESTED`, `STAFF_CONFIRMED`, `PREPARING`, `READY_FOR_COLLECTION`, `COMPLETED`, and `CANCELLED`. Do not add a database.

## Phase 5 - cart tools

### 18. Implement `getMenu`

> Add only `getMenu` to the AI tool loop using `agent/tool-contracts.md` as the interface contract. It must read active/owner-enabled runtime menu items and support category filtering. Test it with menu questions; do not add other tools.

### 19. Implement `addItemToCart`

> Add only `addItemToCart`. Validate the item and any required variant against the runtime menu. Ask for missing required choices instead of guessing. Do not add checkout or modification tools.

### 20. Implement `modifyItem`

> Add only `modifyItem` for changing quantity and valid configured variants on an existing cart item. Validate every change against menu data; do not change other tool behaviour.

### 21. Implement `removeItem`

> Add only `removeItem` to remove an item or reduce quantity. Preserve all existing tool behaviour.

### 22. Implement `viewCart`

> Add only `viewCart` to return an itemized cart summary. Do not calculate a final total in the language model and do not add checkout yet.

## Phase 6 - recommendations and promotions

### 23. Add restrained recommendations

> Add deterministic recommendation rules that can suggest at most two real, available, owner-enabled menu items based on the current cart. Do not repeat declined suggestions and do not invent pairings.

### 24. Add `applyPromotion`

> Add `applyPromotion` that validates only configured active promotions and their eligibility rules. Reject unknown discount codes. With no approved promotions configured, return no promotion rather than a sample discount.

## Phase 7 - Cladium fulfilment and requests

### 25. Implement takeaway collection

> Add takeaway-only fulfilment. Collect the customer name and optional preferred collection time, but clearly label collection time as subject to staff confirmation. Never expose delivery fields.

### 26. Enforce the no-delivery policy

> Add a testable policy response for delivery requests: politely state that home delivery is not currently available, offer takeaway, and offer official WhatsApp staff handoff. Do not collect delivery address data.

### 27. Add booking and event request capture

> Add tools/flows for table, limited-treehouse, and birthday/event requests. Capture only essential details. State that treehouses require availability confirmation; décor starts from PKR 8,000; cakes are not provided; and outside food is not allowed. Do not automatically confirm any request.

## Phase 8 - deterministic pricing and confirmation

### 28. Implement deterministic totals

> Calculate subtotals, approved promotions, and any configured tax/service-charge rules in code only. Tax and service-charge rates are currently unconfigured, so display this transparently and do not fabricate a payable final total until owner configuration is supplied.

### 29. Implement final request review

> Before an order request, show a complete structured review: items, quantities, valid variants, takeaway details, approved promotions, subtotal, configured charges, and known/unknown total status. For bookings/events, show the request details and staff-confirmation notice.

### 30. Add explicit customer confirmation gates

> Require an unambiguous affirmative confirmation after the review. Ambiguous replies never count. Do not persist drafts, unconfirmed carts, or tentative booking/event requests.

### 31. Persist confirmed requests in development storage

> After explicit customer confirmation, persist only the structured request with unique ID, timestamp, and `REQUESTED` status. Do not use `STAFF_CONFIRMED` until a staff user acts.

## Phase 9 - staff dashboard

### 32. Create a protected staff dashboard

> Build a minimal protected staff dashboard for orders, bookings, and events. Show request ID, submitted details, customer contact, calculated charges/status, and state controls. Use the appropriate workflows; only staff may set confirmation, preparation, readiness, completion, or cancellation.

### 32a. Add the Vapi browser voice concierge

> After text chat and the deterministic tool layer pass their tests, add an optional browser voice control using the Vapi Web SDK. Use only the restricted public Vapi key in client configuration. Configure and quality-test separate English and Urdu listening/voice profiles; choose the active profile from the language preference, allow an in-call language switch, and do not let one voice read the other language by accident. Route tool execution and webhook events through verified server-side Vercel endpoints; voice and text must share the same policy and tools. Add microphone permission, connecting, active, transcript, language, error, stop-call, and WhatsApp-handoff states. Do not add phone calling, Twilio, outbound campaigns, or a phone number.

## Phase 10 - QA

### 33. Audit against Cladium system rules

> Audit the complete application against `CLAUDE.md`, `cladium-concierge-system.md`, `agent/acceptance-tests.md`, `design/localization-and-rtl.md`, and `design/theme-mode.md`. Test English/Urdu text and audio, RTL, Day/Night, menu accuracy, variants, cart edits, no-delivery enforcement, takeaway capture, unknown tax handling, booking/treehouse/event policies, explicit confirmation in both languages, and staff-only confirmation. Report failures first and fix only verified failures.

### 34. Test complete journeys

> Run and verify customer journeys on desktop and mobile: menu inquiry, cart change, takeaway request, delivery refusal, booking request, treehouse request, birthday décor inquiry, final review, confirmation, and staff status update. Fix only observed issues.

## Phase 11 - production preparation

### 35. Document production persistence

> Add a production note explaining why development file storage is not valid on Vercel serverless production deployments. Define the migration boundary to a persistent PostgreSQL database, Vercel environment separation, Vapi public/private key handling, and verified Vapi webhooks, but do not change functionality yet.

### 36. Run deployment readiness checks

> Verify `.gitignore`, `.env.example`, start scripts, TypeScript checks, tests, accessibility checks, README instructions, source asset attribution, Vapi permission/error states, webhook verification, and that no secret is tracked. Confirm owner decisions still needed: payment method, tax/service-charge rates, staff users, database, privacy-policy approval, and whether/when to enable a Pakistan-compatible phone number.

## Phase 12 - source control and deployment

### 37. Prepare source-control and hosting steps

> Prepare a clean commit plan and exact human-run steps to create/connect a GitHub repository, create a Vercel Pro project, configure distinct Development/Preview/Production environment variables, restrict the Vapi public key to the production/preview origins and Cladium assistant, configure server-only Vapi private credentials, register Vapi webhook/tool URLs, and deploy. Do not push, publish, or configure external accounts without explicit user approval.

### 38. Deploy only after approval

> After explicit approval and all production prerequisites are complete, deploy to Vercel Pro. Verify the live site on desktop and mobile, then test safe text chat, safe Vapi browser voice, takeaway request, booking request, staff access, webhook rejection, and failure states. Do not test or imply delivery.
