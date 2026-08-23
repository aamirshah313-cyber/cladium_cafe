# ADR-0002: Request-and-confirmation scope, not instant commerce

Status: accepted

## Context

Cladium has no live kitchen-capacity, table-inventory, payment, or delivery source of truth. Presenting the site as instant ordering/booking would misrepresent what the system can guarantee.

## Decision

Public actions are limited to **Start Takeaway Request**, **Request a Table**, **Request Treehouse Seating**, **Plan a Birthday**, **Ask Cladium Concierge**, and **Continue on WhatsApp**. Every guest submission creates a `REQUESTED` record per the state machines in `data-model-v2.md` §5; only authorized staff can advance it. Home delivery, accommodation booking, automatic availability, automatic event quotation, online payment, and autonomous confirmation are excluded until a separately approved, flagged release.

## Rejected alternatives

- **Instant-order/instant-book CTAs** ("Place Order," "Book Now," "Check Availability") — rejected as dishonest UX with no live source of truth behind them; explicitly forbidden by `CLAUDE.md`.
- **Client-side auto-confirmation** — rejected; only staff-authorized transitions may set `ACCEPTED`/`CONFIRMED`/`QUOTED`/etc.

## Reversible boundary

`BOOKING_REQUESTS`, `EVENT_REQUESTS`, `ONLINE_PAYMENT`, and delivery capability are server-authoritative feature flags. Enabling real-time availability or payment later is a flagged, separately gated change, not an architecture rewrite.

## Source

`production-architecture-v2.md` §1, §5; `data-model-v2.md` §5; `release-gates-v2.md` Gate 1.
