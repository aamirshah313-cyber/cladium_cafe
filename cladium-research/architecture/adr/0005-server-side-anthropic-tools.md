# ADR-0005: Server-side Anthropic orchestration behind strict typed tools

Status: accepted

## Context

The concierge must never calculate prices or decide operational facts itself, must not carry the full menu in every prompt, and must treat browser-supplied history as untrusted.

## Decision

The Anthropic Messages API is called only from server-only routes. The model selects strict, schema-validated tools (menu/business-data lookups, request-draft actions) that reject unknown properties; the server executes deterministic domain services and validates every tool result before the model explains it. The orchestration loop is bounded by tool-call, token, and time limits with a safe staff/WhatsApp fallback. Any write requires the visible review UI plus an expiring single-use confirmation token bound to the review hash, and an idempotency key.

## Rejected alternatives

- **Browser-direct Anthropic calls** — rejected; would expose the API key and bypass server validation.
- **Embedding the full menu in the system prompt every turn** — rejected; the master prompt explicitly forbids this, and menu facts must come from the `getMenu` tool against the published version.
- **Letting the model compute prices/decide facts** — rejected; `CLAUDE.md` requires deterministic business logic, with the model only conversing and calling tools.

## Reversible boundary

Tool contracts are the integration boundary; swapping the model provider later means reimplementing the orchestration adapter only, not the domain services, tool schemas, or confirmation-gate logic.

## Source

`production-architecture-v2.md` §8; `CLAUDE.md` implementation rules.
