# Master build prompt for Claude

> **Legacy reference only.** Do not use this prompt for a new build. Use `MASTER_BUILD_PROMPT_V2.md`, the Version 2 production architecture, and the Version 2 runbook.

Paste this prompt into Claude **after uploading the `cladium-research` folder**. Do not ask Claude to use third-party images in place of the provided assets.

---

You are a senior product designer and full-stack engineer. Build a production-minded, luxury, mobile-first web application for **Cladium Café & Resort, Abbottabad, Pakistan**.

## Source-of-truth files

Read and obey these files before writing code:

1. `data/business-profile.json` — business identity, verified contact channels, location and map metadata.
2. `data/menu.json` — current transcribed menu data and price variants.
3. `brand/visual-direction.md` — visual direction and working palette.
4. `architecture/product-blueprint.md` — experience and integration design.
5. `assets/provided/` — approved reference assets: logo variants, authentic venue photo, and menu artwork.
6. `design/menu-carousel-reference.md` — approved interaction adaptation from the uploaded video reference; use this for the menu feature carousel only.
7. `design/localization-and-rtl.md` — required English/Urdu interface, text concierge, and voice concierge rules.
8. `design/theme-mode.md` — required Day/Night theme system and accessibility rules.

Never invent menu items, prices, availability, opening hours by day, delivery areas, booking capacity, payment confirmations, event offers, allergies, or policies. Mark uncertain content as `Needs confirmation` in admin preview, and hide it on the public site by default.

## Product goal

Create a polished experience that turns discovery into two primary actions: **Start Takeaway Request** and **Request a Table**. The feeling is a tranquil, premium mountain garden—quietly cinematic, not flashy or generic.

## Design system

- Base palette: forest/midnight green, antique gold, warm ivory, charcoal. Use tokens, not scattered colour literals.
- Display type: a high-contrast editorial serif. UI/body: clean contemporary sans with excellent mobile readability and future Urdu support.
- Use the supplied logo only as image artwork. Do not attempt to recreate it with a font or icon.
- Use the authentic garden image in the hero/gallery. Preserve its crop and natural atmosphere. Build flexible image slots so the owner can later add high-resolution food and interior photographs.
- Respect `prefers-reduced-motion`; animation should be subtle: fades, gentle parallax only if performant, and refined hover transitions.
- Meet WCAG AA contrast and keyboard navigation requirements.
- Ship English and Urdu from the first release. Add an accessible language switcher; Urdu sets `lang="ur"` and `dir="rtl"` at the document level and uses CSS logical properties.
- Ship an accessible, persistent `Day | Night` theme control. Use semantic tokens; never hard-code component colors. Day is lighter warm ivory/sage and Night is midnight forest/gold. Both must preserve the supplied logo and meet contrast requirements.

## Pages and conversion paths

Implement:

1. `/` Home: cinematic hero, concise brand story, signature menu highlights, outdoor-garden atmosphere, social proof placeholder, location preview, and persistent `Order` / `Book a Table` actions.
2. `/menu`: filterable categories, item details, size/portion options, cart-ready selections, signature labels, and a transparent tax/service-charge notice. Include the lighter Cladium menu carousel described in `design/menu-carousel-reference.md`. Do not show a dish image for each item unless an approved image is assigned.
3. `/book`: date, time, party size, guest name, phone, notes, consent, request status, and a human-confirmation state. No booking is confirmed until an operations user marks it confirmed.
4. `/order`: cart, **takeaway-only** fulfilment, price summary, taxes/service-charge disclosure, and an order-request state. The business does not currently offer home delivery; do not show, imply, or accept delivery. Do not process a payment without a configured provider.
5. `/gallery`: supplied authentic imagery and CMS-managed future media.
6. `/visit`: verified map, directions, address, official WhatsApp, phone contacts, and hours labelled for verification until confirmed by the owner.
7. `/privacy` and `/terms`: clear placeholder policies that must be owner-reviewed before launch.

## CMS/data model

Create a typed CMS-ready model for `MenuItem`, `MenuVariant`, `MenuCategory`, `MediaAsset`, `VenueArea`, `BookingRequest`, `OrderRequest`, `BusinessHours`, `Offer`, and `SiteSettings`. Delivery is outside launch scope and must not have a public or active launch model. Add typed `LocalizedText` fields for canonical English and owner-approved Urdu, including translation publication state. Do not overwrite canonical English source data.

Import the supplied `menu.json` as seed data. Each menu item needs explicit `isAvailable`, `isFeatured`, `allergens`, `dietaryTags`, `imageId`, and `sortOrder` fields. Default unknown fields to null/false; do not guess them.

## AI concierge and WhatsApp handoff

Create the chatbot as a guided concierge, not an autonomous operator. It may:

- recommend approved menu items;
- answer from approved menu, location, policy, and offer data;
- collect an order or booking request;
- link users to the official WhatsApp chat;
- hand unresolved questions to staff.

It must never claim a booking is confirmed, payment succeeded, stock is available, a dish meets a dietary/allergy need, or a delivery promise is guaranteed unless the relevant live system confirms it. Use a visible human-escalation action in every chat state.

The concierge must understand and reply in English, Urdu script, and common Roman Urdu. Use the selected site language by default, switch immediately on request, and preserve tool-returned menu names, PKR amounts, quantities, dates, links, and statuses exactly. Use owner-approved Urdu content when available; otherwise retain canonical English rather than inventing a public translation. Require explicit, testable English/Urdu confirmation only after a server-generated review.

For birthday/event requests: communicate that décor starts from PKR 8,000, cakes are not provided, and outside food is not allowed. Treat all décor quotes, treehouse availability, and event arrangements as staff-confirmed requests—not automatic bookings.

## Voice concierge with Vapi

Deploy the application to Vercel Pro. Implement an optional Vapi-powered browser voice concierge after the text concierge and deterministic tool layer are working. Use the Vapi Web SDK with a Vapi public key restricted to the production origin and Cladium assistant. Provide separately tested English and Urdu speech recognition and premium voice output profiles; select them from the user language preference and allow an in-call language switch. Keep the Vapi private key and all provider credentials only in Vercel server environment variables.

Use server-side Vercel routes for Vapi webhooks and tool calls. Verify incoming Vapi requests before executing tools. The voice assistant must call the same approved tool layer and follow the same policies as text chat; client-side Vapi tools may update the interface only, never make a business decision or persist a request. Do not implement phone calling, outbound campaigns, Twilio, or a phone-number purchase in the initial release.

## Meta/analytics readiness

Add a consent-gated analytics abstraction with named events only: `view_menu`, `select_menu_item`, `add_to_cart`, `begin_order`, `submit_order_request`, `begin_booking`, `submit_booking_request`, `whatsapp_click`, and `booking_confirmed`. Do not add real Meta IDs or API secrets to client code. Leave environment-variable placeholders and server-side integration interfaces.

## Technical quality bar

- TypeScript, modern component architecture, responsive design from 360px upward.
- Validate all public forms on client and server; use rate limiting and honeypot/anti-spam measures.
- Store credentials only in server-side environment variables.
- Configure separate Development, Preview, and Production environment values on Vercel. Do not prefix any private key with `NEXT_PUBLIC_`.
- Provide empty-state, loading, error, and offline-friendly states.
- Add tests for menu price calculations, variants, booking validation, order validation, and chatbot guardrails.
- Add English/Urdu UI, RTL, text/voice language-routing, cross-language confirmation, Day/Night visual, and `prefers-color-scheme` tests.
- Include a `README` with local setup, environment variables, deployment notes, and the exact owner decisions required before launch.

## Delivery sequence

First return: information architecture, data schema, design token list, and implementation plan. Then build in small verifiable stages: foundation → public pages → menu/cart → booking/order requests → concierge → integrations → testing/accessibility. At every stage, list assumptions and do not move past missing owner decisions by inventing data.

---
