# ADR-0006: Vapi browser voice secured by short-lived JWT and HMAC tool auth

Status: accepted

## Context

Vapi is the chosen voice provider. No long-lived Vapi credential may ship to the browser. English and Urdu need independently configured, independently tested assistants. Recording is off by default.

## Decision

The browser calls `POST /api/vapi/token` after origin, rate-limit, feature-flag, and session checks; the server signs a short-lived public JWT restricted to the verified origin and the selected environment-specific English/Urdu assistant ID. Vapi tool/webhook calls are authenticated with a Custom Credential using HMAC-SHA256, timestamp-freshness checks, constant-time signature comparison, and replay rejection; `toolCallId` drives idempotent deduplication into the same domain services text chat uses. Voice may draft, but the guest must tap the visible web review to submit.

## Rejected alternatives

- **Long-lived `NEXT_PUBLIC_VAPI_PUBLIC_KEY` in the browser** — rejected; explicit non-negotiable rule in `CLAUDE.md` and `release-gates-v2.md` Gate 6.
- **Phone/SIP calling at launch** — rejected; a later, separately approved carrier/SIP integration (not Twilio by default per `deployment-target.md`).
- **Voice-only confirmation without a visible tap** — rejected; violates the shared confirmation-gate rule.

## Reversible boundary

Voice access is isolated behind `modules/voice` and `modules/integrations`; the confirmation-token/idempotency contract is shared with text chat, so a future voice-provider change doesn't touch write-path guarantees.

## Source

`production-architecture-v2.md` §9; `deployment-target.md` Vapi boundaries; `release-gates-v2.md` Gate 6.
