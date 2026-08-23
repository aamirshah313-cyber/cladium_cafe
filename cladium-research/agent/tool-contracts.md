# Agent tool contracts

These are implementation contracts for Claude Code. Tools execute server-side business logic; the model selects a tool but cannot bypass validation or modify data directly. Every tool schema is strict, rejects unknown properties, uses server-derived session/auth context, and returns a typed bounded result.

## Read-only tools

| Tool | Inputs | Deterministic result | Guardrails |
| --- | --- | --- | --- |
| `getMenu` | `query?`, `category?`, `itemId?` | Approved enabled menu items, prices, variants, and configured facts | Never expose unavailable/draft items. Unknown facts return `null`. |
| `getVenueInfo` | `topic` | Hours, address, map URL, official WhatsApp link, confirmed policies | Must read only from approved business profile/operations knowledge. |
| `viewCart` | no browser-supplied session ID; use authenticated server context | Itemized cart and missing selections | No total calculated by the model. |
| `getRequestStatus` | request ID plus authorized customer/staff context | Current request status | Do not reveal another guest's request. |

## Cart tools

| Tool | Required inputs | Result | Guardrails |
| --- | --- | --- | --- |
| `addItemToCart` | `itemId`, `quantity`, `variantSelection?` | Updated cart or required-choice error | Validate item/variant/quantity against runtime menu. |
| `modifyCartItem` | `cartItemId`, `quantity?`, `variantSelection?` | Updated cart | Reject invalid choices; no free-text price changes. |
| `removeCartItem` | `cartItemId` or validated item reference | Updated cart | Cannot remove a non-existent item. |
| `calculateCart` | authenticated server context | Subtotal, approved discounts, configured charges, known-total status | Server code only; return `totalStatus: UNCONFIGURED` when charge settings are incomplete. |
| `applyPromotion` | `code` or promotion ID | Validated active promotion result | Disabled until an owner adds an active promotion. |

## Request creation tools

| Tool | Required inputs | Result | Guardrails |
| --- | --- | --- | --- |
| `prepareTakeawayRequest` | cart, name, contact, preferred pickup time? | Draft order review | Delivery fields are forbidden. Preferred time is never a promise. |
| `submitTakeawayRequest` | single-use confirmation token, idempotency key | `REQUESTED` order ID | Token must be bound to session/action/review hash; save atomically after deterministic review and explicit visible confirmation. |
| `prepareBookingRequest` | date, preferred time, guests, name, contact, area preference? | Draft booking review | Treehouse is a preference, never confirmed inventory. |
| `submitBookingRequest` | single-use confirmation token, idempotency key | `REQUESTED` booking ID | Requires staff confirmation later; requested date/time is not availability. |
| `prepareEventRequest` | date, preferred time, guest count, name, contact, occasion, decor interest | Draft event review | State decor starts from PKR 8,000; do not calculate final price. |
| `submitEventRequest` | single-use confirmation token, idempotency key | `REQUESTED` event ID | No cake/outside-food exception may be promised. |
| `createWhatsAppHandoff` | request category, concise conversation summary | Official click-to-chat URL + safe summary | Never include secrets or more personal data than necessary. |

## Staff-only tools

`staffUpdateRequestStatus`, `staffConfigureAvailability`, `staffConfigureCharges`, `staffManagePromotions`, and `staffManageMenu` require authenticated staff roles. The public agent must never invoke them.

## State machines

```text
Takeaway: DRAFT -> REQUESTED -> ACCEPTED -> PREPARING -> READY -> COLLECTED
                         \-> REJECTED
          REQUESTED/ACCEPTED/PREPARING -> CANCELLED

Booking:  DRAFT -> REQUESTED -> CONFIRMED -> SEATED -> COMPLETED
                         \-> DECLINED
          REQUESTED/CONFIRMED -> CANCELLED
          CONFIRMED -> NO_SHOW

Event:    ENQUIRY -> REQUESTED -> QUOTED -> CUSTOMER_ACCEPTED -> CONFIRMED
          applicable pre-confirmation states -> CANCELLED
```

`REQUESTED` means the guest explicitly submitted a request. It does not mean accepted, paid, available, or confirmed.

Every transition is implemented in the deterministic domain service, role-authorized, version-checked, and accompanied by an append-only event recording actor, timestamp, reason, previous/new state, and correlation ID. Request creation also writes an outbox notification in the same database transaction.

Vapi calls use `toolCallId` as an idempotency input. Voice and text tools may prepare drafts, but final submission requires the same visible website review and tap-confirmation path as manual forms.
