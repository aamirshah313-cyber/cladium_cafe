# voice

Vapi profiles, token issuance, tools, and webhooks.

- `profiles/` — controlled, version-controlled assistant configuration
  templates (Runbook Step 30). No live Vapi call, no credential, no
  assistant id — see `profiles/types.ts` and `docs/vapi-deployment.md`.
- Token issuance (`/api/vapi/token`), authenticated tools/webhooks
  (`/api/vapi/tools`, `/api/vapi/webhook`), and the voice web UI are later
  runbook steps (31–33), not built yet.
