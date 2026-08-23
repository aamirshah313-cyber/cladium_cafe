# ADR-0008: Provider-neutral typed adapters for all external integrations

Status: accepted

## Context

Vercel, Supabase, Anthropic, Vapi, WhatsApp, and Meta are all external providers that may change or be re-evaluated. Business/domain logic must stay portable, testable, and independent of any one vendor's SDK shape.

## Decision

Every external provider is accessed only through a typed adapter in `modules/integrations/`. Domain services depend on adapter interfaces, never on provider SDKs directly. Disabled integrations (WhatsApp Cloud, Meta, online payment) are stub/no-op adapters gated by server-authoritative feature flags — present in shape, inert in behavior — rather than code that would need to be rebuilt from scratch when later approved.

## Rejected alternatives

- **Importing provider SDKs directly into domain/route code** — rejected; couples business logic to vendor APIs and complicates testing/mocking.
- **A generic plugin framework/abstract provider registry** — rejected as premature abstraction beyond what the launch scope needs, per `CLAUDE.md`'s guidance against speculative design.

## Reversible boundary

This ADR is the reversibility mechanism the other ADRs (0001, 0005, 0006, 0007) depend on: every "swap provider later" claim assumes this adapter boundary is real and enforced by code review, not just convention.

## Source

`production-architecture-v2.md` §2 ("Keep business logic provider-neutral..."); `CLAUDE.md` implementation rules.
