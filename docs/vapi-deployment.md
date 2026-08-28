# Vapi assistant deployment procedure

Runbook Step 30. Authoritative sources: `cladium-research/architecture/deployment-target.md` ("Vapi boundaries"), `production-architecture-v2.md` §9, `cladium-research/architecture/adr/0006-vapi-jwt-hmac-voice-security.md`, `release-gates-v2.md` Gate 6.

**Nothing in this repository creates or updates a real Vapi assistant.** `src/modules/voice/profiles/` holds the _content_ templates (system prompt, greeting, call-shape limits) as version-controlled code; the real Vapi-side assistant object (and the id Vapi assigns it) is created by a human, outside the codebase, following the procedure below. This mirrors `docs/database-environments.md`'s Supabase pattern exactly: config-as-code in git, live resources and their ids provisioned per environment outside it.

## Three isolated assistant sets, matching the three Supabase environments

| Environment       | Vapi assistants live in                                                     | ID/secret source                          | Rule                                                                       |
| ----------------- | --------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| Development       | a development-only Vapi org (or sandboxed assistants in the shared dev org) | `.env.local` (git-ignored)                | Test calls only. Never a guest-facing number/link.                         |
| Preview / staging | its own assistants, created for review                                      | Vercel "Preview" environment variables    | Separate from production; a broken preview prompt must never reach guests. |
| Production        | its own assistants, created only after Gate 6 passes                        | Vercel "Production" environment variables | Only environment ever linked from the public site.                         |

An assistant id (`VAPI_ASSISTANT_EN_ID` / `VAPI_ASSISTANT_UR_ID`), the org id (`VAPI_ORG_ID`), the signing key (`VAPI_PRIVATE_KEY`), and the webhook HMAC secret (`VAPI_WEBHOOK_HMAC_SECRET`) are **never committed** — they are set directly in each environment's own secret store, exactly like every other credential in `deployment-target.md`'s table. `src/modules/voice/profiles/types.ts` has no field for any of them, so a template can never accidentally carry one across an environment boundary.

## Procedure: creating or updating an assistant from a template

1. **Pick the template cell.** `src/modules/voice/profiles/templates.ts`'s `VAPI_PROFILE_MATRIX[environment][locale]` is the source of truth for that cell's `systemPrompt`, `firstMessage`, `closingMessage`, `maxCallDurationSeconds`, `silenceTimeoutSeconds`, `endCallTriggerPhrases`, and `voiceStack`.
2. **Create or update the Vapi assistant** (Vapi dashboard or API, done by a human with access to that environment's Vapi org) using exactly those field values — copy them, do not paraphrase. `voiceStack.status` is `'PENDING_BAKEOFF'` until Step 34 chooses a real provider/voice/transcriber; leave the assistant's voice/transcriber on a reasonable Vapi default until then, since nothing here is guest-facing yet.
3. **Record the resulting assistant id** in that environment's own secret store only (`VAPI_ASSISTANT_EN_ID` / `VAPI_ASSISTANT_UR_ID` in Vercel's Development/Preview/Production environment variables, or `.env.local` for local dev). Never write it into `templates.ts`, `.env.example`, or any committed file.
4. **Attach the shared server tools/webhook** (Step 32) once built — the same `POST /api/vapi/tools` route for every environment; only the base URL differs, and that comes from `NEXT_PUBLIC_APP_URL`, already environment-scoped since Step 13.
5. **Verify before promoting**: confirm the live assistant's system prompt/greeting matches the template cell exactly (no manual dashboard edits drifted from git), and that `recordingEnabled` is off in the Vapi assistant settings, matching `recordingEnabled: false` in the template.

## Promotion order

Development → Preview → Production, one environment at a time, never skipped:

1. Update the template cell(s) in `templates.ts`, bump `configVersion`, add a `CHANGELOG.md` entry (see that file's own "whenever policy/tools change" checklist).
2. Apply to the **development** assistant first; smoke-test manually.
3. Apply to **preview**; exercise it through a real preview deployment before touching production.
4. Only after preview looks right, apply to **production** — and only once Gate 6's own checklist (`release-gates-v2.md`) is satisfied for anything guest-facing.

A `configVersion` bump does not require every environment to move in lockstep — `preview` may sit one version ahead of `production` while a change is under review. What must never happen is a `production` cell silently drifting out of sync with what `templates.ts` says `production` should be; `tests/unit/voice-profiles.test.ts` is the mechanical check for the _code-level_ half of that (fingerprints, matrix completeness), the manual step 5 above is the check for the _live-assistant-vs-template_ half, which nothing in this repository can verify automatically without a live Vapi credential.

## What this step deliberately does not do

- No live Vapi API call. No `VAPI_*` credential is read anywhere in `src/modules/voice/`.
- No provider/voice/transcriber selection — `voiceStack` stays `PENDING_BAKEOFF` in every cell until Step 34's real-speaker bake-off produces evidence.
- No token issuance (`/api/vapi/token`, Step 31) or tool/webhook routes (`/api/vapi/tools`, Step 32).
- No Urdu spoken content — `firstMessage`/`closingMessage` render as English in every locale until a fluent-speaker/owner review approves real Urdu audio content (Step 34), stricter than the already-reviewed UI-copy bar `lib/i18n/chrome.ts` uses.
