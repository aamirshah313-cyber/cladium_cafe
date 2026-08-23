# ADR-0007: Transactional outbox for notification delivery

Status: accepted

## Context

The staff dashboard subscribes to Supabase Realtime for speed, but Realtime is not a delivery guarantee. A request write must never silently lose its staff/customer notification if downstream delivery fails.

## Decision

`outbox_events` is written in the same transaction as the business state change (request submission or staff transition). An authenticated dispatcher worker claims and retries entries with bounded exponential backoff, records terminal failures for staff attention, and uses idempotent handlers.

## Rejected alternatives

- **Fire-and-forget calls to WhatsApp/notification APIs inside the request transaction** — rejected; couples unrelated failure domains and risks silent notification loss on partial failure.
- **Relying on Realtime alone as the delivery guarantee** — rejected; `production-architecture-v2.md` §10 explicitly calls this insufficient.

## Reversible boundary

The outbox schema is destination/payload-agnostic; adding a new notification channel (e.g., a future flagged WhatsApp Cloud integration) is additive, not a rewrite of the write path.

## Source

`production-architecture-v2.md` §10; `data-model-v2.md` §6 (`outbox_events`); `release-gates-v2.md` Gate 4.
