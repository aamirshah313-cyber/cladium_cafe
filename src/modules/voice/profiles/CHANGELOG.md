# Vapi assistant configuration changelog

Runbook Step 30. One entry per change to `templates.ts`, `policy.ts`'s
`POLICY_VERSIONS`/`TOOL_SCHEMA_VERSIONS`, or `types.ts`'s shape. Newest
entry first. This file is the human-readable half of the drift-detection
pair described in `policy.ts`'s doc comment — `tests/unit/
voice-profiles.test.ts` is the machine-checked half.

## v1 — 2026-08-28 (Step 30, initial controlled template)

- Added the six-cell `VAPI_PROFILE_MATRIX` (development/preview/production ×
  en/ur). All six cells currently share identical content — nothing has
  diverged yet.
- `systemPrompt` wraps `CONCIERGE_SYSTEM_POLICY` (Step 26) verbatim plus a
  short voice-conduct addendum (brevity, "I'll put this on your screen to
  review," graceful call-ending) — never a second, independently-authored
  copy of the approved facts/rules.
- `policyVersion: 'v1'` pinned to fingerprint `7b7a3f4bde86beda` of
  `CONCIERGE_SYSTEM_POLICY` as it stood at this commit.
- `toolSchemaVersion: 'v1'` pinned to fingerprint `8b5a8923d9c9bed6` of the
  six-tool `TOOL_DEFINITIONS` list (Steps 27–28: `getMenu`, `getVenueInfo`,
  `viewCart`, `getRequestStatus`, `prepareBookingRequest`,
  `prepareEventRequest`) as it stood at this commit.
- `firstMessage`/`closingMessage` are `canonicalLocalizedText` — render as
  English in both locales. Deliberately stricter than `lib/i18n/chrome.ts`'s
  already-reviewed UI-copy precedent: this becomes literal spoken audio, and
  no fluent-speaker/owner review of Urdu voice content has happened yet
  (that is Step 34's job). `endCallTriggerPhrases` is English-only for the
  same reason.
- `voiceStack: { status: 'PENDING_BAKEOFF' }` in every cell — no
  provider/voice/transcriber has been chosen. Do not flip any cell to
  `SELECTED` outside of Step 34's real-speaker bake-off; when that happens,
  bump `configVersion` and add a new entry here recording the
  `evidenceRef`.
- No assistant id, org id, or credential appears anywhere in this template —
  see `types.ts`'s doc comment for why that is structural. Real per-
  environment assistant ids live only in Vercel env vars
  (`VAPI_ASSISTANT_EN_ID`/`VAPI_ASSISTANT_UR_ID`, `deployment-target.md`) and
  are wired up by Step 31, not this step.

### Whenever `CONCIERGE_SYSTEM_POLICY` or `TOOL_DEFINITIONS` changes

1. Run the suite — `tests/unit/voice-profiles.test.ts` will fail with the
   old vs. new fingerprint.
2. Decide: does the voice assistant need the new content immediately, or can
   it lag briefly behind text? (Usually: immediately — `CLAUDE.md` requires
   the same approved knowledge/tool contracts for both.)
3. Add a new `vN` entry to `POLICY_VERSIONS`/`TOOL_SCHEMA_VERSIONS` in
   `policy.ts` with the new fingerprint, point the relevant profile(s) at it,
   and add a dated entry here explaining what changed and why.
