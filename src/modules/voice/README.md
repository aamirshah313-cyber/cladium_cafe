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
- Authenticated tools/webhooks (`/api/vapi/tools`, `/api/vapi/webhook`) and
  the voice web UI are later runbook steps (32–33), not built yet.
