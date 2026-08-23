# Product blueprint

## Public website

1. **Home** — cinematic mountain-led introduction, signature dining, key ambience, approved current offers, and direct takeaway/table request actions.
2. **Menu** — searchable categories, individual items, price/variant/add-on selection, dietary flags, cart, and availability state. The initial fulfilment option is **takeaway only**; do not expose delivery.
3. **Request a table** — date/time/guest flow, area preference, event notes, pending-request receipt, and staff follow-up. Surface treehouse seating as limited and requiring staff confirmation.
4. **Resort & experiences** — only if accommodation or experience bookings are actually offered; otherwise do not promise them.
5. **Gallery** — owner-approved imagery and short videos, arranged by ambience, food, and views.
6. **Location** — embedded official Google Map, directions, hours, parking/access notes, and contact details.
7. **Offers/events** — time-bounded campaigns that can be published without redeploying the site.

## Conversational assistant

The assistant should answer only from the approved menu, booking, location, policy, and campaign data. It must support English and Urdu in both text and audio, including Urdu-script and Roman Urdu input. The selected site language sets the response language unless the guest explicitly asks to switch.

Primary actions:

- recommend menu items and upsells;
- create or hand off takeaway-request drafts;
- record a booking request and explain that staff must confirm it;
- provide directions, hours, policies, and event details;
- hand off complex or sensitive requests to staff in WhatsApp.

Guardrails: never invent prices, availability, allergies, confirmation numbers, or payment status; always state when a staff member must confirm.

For birthdays/events, the concierge may state that décor starts from **PKR 8,000**, the café does not provide cakes, and outside food is not allowed. It must collect the request and obtain staff confirmation for décor design, final price, date, seating, and any exception.

## Practical launch architecture

```text
Guest → Next.js luxury web app (Vercel Pro) → PostgreSQL/CMS → order + booking services
                 │                                │                    │
                 │                                │                    ├→ payment provider / cash-on-collection rules
                 │                                │                    └→ operations dashboard / staff notifications
                 │                                │
                 ├→ text concierge (approved knowledge + action APIs)
                 ├→ Vapi browser voice concierge → signed Vercel tool/webhook routes
                 └→ WhatsApp Business Platform → human staff escalation
```

Meta Pixel + Conversions API receive consented view-menu, add-to-cart,
submit-order-request, submit-booking-request, and WhatsApp-lead events. They do
not receive purchase or booking-confirmed events from a guest request.

## Hosting and voice deployment decision

- **Production host:** Vercel Pro. Use a Next.js application with server-side route handlers for chat, order/booking requests, staff functions, Vapi tool execution, and Vapi webhook processing.
- **Database:** use Supabase Pro PostgreSQL, Auth, Storage, Realtime, RLS, backups, and isolated environments. Functional request flows must use the production-shaped database from the start; files are never operational persistence.
- **Voice:** Vapi powers the in-browser “Talk to Cladium” voice concierge. The browser receives a short-lived origin- and assistant-restricted public JWT; Vapi private credentials and provider keys remain in Vercel server environment variables. Vapi tools use HMAC authentication, replay protection, and idempotency.
- **Consistency:** the text chat and Vapi assistant share one concierge policy, runtime menu adapter, promotion source, deterministic tool layer, and the separate takeaway/booking/event state machines. Voice can prepare a draft but final submission requires the visible web review and an explicit tap; it cannot confirm availability, payment, prices with unconfigured charges, or staff decisions.
- **Languages:** English and Urdu are launch requirements for the interface, text concierge, and Vapi voice concierge. Select a tested Urdu voice and transcriber for Urdu interactions and a separately tested English voice/transcriber for English. The language switch changes the UI and active voice profile, and must not corrupt prices, IDs, status, or request state.
- **Themes:** provide persistent Day and Night themes using semantic design tokens. Day is a lighter warm-ivory/sage presentation; Night uses the official midnight-forest character. Both preserve contrast and supplied logo artwork.
- **Phone phase:** do not buy or configure a phone number for launch. Vapi's free phone-number option is US-only; a later Pakistan-compatible carrier/SIP number must be verified for availability, regulation, pricing, and porting before it is connected to Vapi.
- **Portability:** avoid hosting-vendor-specific business logic. Netlify remains a fallback deployment option, but Vercel is the selected production target.

## Meta and WhatsApp prerequisites

Use the official WhatsApp Business Platform / Cloud API via the business-owned Meta portfolio. The café must approve message templates and control the account. Connect Meta ads only after the website's consent mechanism, pixel/dataset, event definitions, and privacy policy are live.
