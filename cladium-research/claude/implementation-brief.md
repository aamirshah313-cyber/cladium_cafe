# Claude implementation brief — Version 2 architecture governs the build

Build a premium, responsive web application for **Cladium Café & Resort, Abbottabad**. The brand is a luxury mountain escape: serenity, panoramic views, aesthetic ambience, premium family dining, and the invitation to relax, refresh, and reconnect.

Use the project research pack as the single source of truth:

- `data/business-profile.json` for verified facts;
- `brand/visual-direction.md` for visual direction;
- the owner-provided menu/media/location data for all operational content.

Create an editorial, cinematic experience with a deep forest-green foundation, restrained antique-gold accents, warm off-white reading surfaces, refined serif display typography, and accessible modern sans-serif UI. Do not invent dishes, prices, address, WhatsApp number, delivery areas, booking rules, accommodations, or promotions.

Required capabilities: accessible menu browsing, a takeaway-request cart, table/treehouse request flows, birthday/event enquiries, Google Maps location, a protected staff workspace, mandatory English/Urdu UI and text/audio concierge, Roman Urdu support, persistent accessible Day/Night themes, human WhatsApp handoff, consent-gated Meta request-event hooks, and a privacy/consent experience.

Build the production-shaped Supabase data model, RLS, separate request state machines, audit history, idempotency, and transactional outbox before functional flows. Guest actions create pending requests, not confirmed orders/bookings or purchases. Add explicit assistant safety rules: never fabricate operational facts, prices, allergies, stock, payment state, availability, or confirmation; escalate when data is missing.

Use Next.js on Vercel Pro, Anthropic server-side strict tools, and Vapi browser voice with short-lived origin/assistant-restricted JWTs and authenticated replay-protected server tools. Recording, delivery, online payment, automatic availability, public phone voice, WhatsApp Cloud, and Meta marketing remain disabled until their release gates pass.

Start with `claude/MASTER_BUILD_PROMPT_V2.md`, then execute `claude/CLADIUM_CODE_BUILD_RUNBOOK_V2.md` one approved step at a time.
