# voice

Vapi profiles, token issuance, tools, and webhooks.

- `profiles/` — controlled, version-controlled assistant configuration
  templates (Runbook Step 30). No live Vapi call, no credential, no
  assistant id — see `profiles/types.ts` and `docs/vapi-deployment.md`.
- `token/`, `schemas.ts`, `deps.ts` — `POST /api/vapi/token` (Runbook
  Step 31): issues a short-lived, origin/assistant-restricted public JWT
  after feature-flag/session/CSRF/origin/rate-limit checks. The real
  signing adapter lives in `modules/integrations/vapi-client.ts` — never
  live-called in this sandbox (no `VAPI_PRIVATE_KEY`), same standing
  limitation as `modules/integrations/anthropic-client.ts` (D-031).
- `tools/`, `webhook-auth.ts` — `POST /api/vapi/tools`/`/api/vapi/webhook`
  (Runbook Step 32): HMAC-SHA256/timestamp/replay-verified
  (`webhook-auth.ts`, reusing `lib/security/webhook.ts` unchanged),
  `toolCallId`-idempotent (`tools/execute-vapi-tool-calls.ts`, reusing Step
  19's `runIdempotent`), bounded (call-count cap + per-call timeout), and
  dispatches through the exact same `modules/concierge/tool-registry.ts`
  text chat uses — never a second tool implementation. No live Vapi
  webhook traffic exists in this sandbox (no `VAPI_WEBHOOK_HMAC_SECRET`
  attempt), same standing limitation as Step 31's token issuance.
- The voice web UI is a later runbook step (33), not built yet.
