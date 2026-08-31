# Staging release report

Runbook Step 43 (Phase 9, "staging, UAT, and production" begins). Evidence bullet: "staging URL, commit, migration/menu/assistant versions, and smoke report recorded." This is the first runbook step this project has run against real, externally-hosted infrastructure rather than this sandbox's own local tooling — a genuine Vercel deployment and a genuine hosted Supabase project, both created and operated by the business owner, not this build process.

**Staging URL:** `https://cladium-cafe.vercel.app`
**Deployed commit:** `428f105` — "fix: backup, restore, and rollback drill (Step 42)" (no application source changed during this step — Step 43 is deployment and verification only, the first runbook step with an entirely clean `src/`/`tests/` diff)
**Vercel plan:** Hobby, deliberately — the owner's own decision, tracked as a Gate 9 item to upgrade to Pro before commercial/production use (`deployment-target.md`'s Pro requirement is specifically for production; nothing about this app's own bounded timeouts or environment-variable scoping differs between Hobby and Pro, confirmed in the checklist prepared for this step)
**Supabase project:** a dedicated, isolated staging project (`vxvpxywszskxcugwpsch`), never shared with local development or any future production project
**Migrations:** all 13 (12 original + Step 42's grant-privilege fix) applied cleanly via `supabase db push`; `db:test:schema` and `db:test:rls` both re-run live against this real hosted project and passed — the same two checks Step 42's local drill proved, now proven against genuinely external infrastructure
**Vapi/voice assistants:** deliberately not configured — `FEATURE_VOICE_EN`/`FEATURE_VOICE_UR` stay `false`, matching the recommended default (Gate 6's real-speaker bake-off, Step 34, remains explicitly deferred)

## Feature flags as deployed

| Flag | Value | Why |
|---|---|---|
| `FEATURE_PUBLIC_SITE` | `true` | The site itself |
| `FEATURE_TAKEAWAY_REQUESTS` | `true` | Proves real submission against real Postgres |
| `FEATURE_BOOKING_REQUESTS` | `true` | Same |
| `FEATURE_EVENT_REQUESTS` | `true` | Same |
| `FEATURE_TEXT_CONCIERGE` | `true` | Real Anthropic key configured; verified live |
| `FEATURE_VOICE_EN` / `FEATURE_VOICE_UR` | `false` | Gate 6 bake-off not run (Step 34, deferred) |
| `FEATURE_WHATSAPP_CLOUD` | `false` | Gate 8 prerequisites unmet |
| `FEATURE_META_MARKETING` | `false` | Pixel script not wired in (tracked, Step 37) |
| `FEATURE_ONLINE_PAYMENT` | `false` | Not built |

`STAFF_DEV_ACCOUNTS` was set for this staging round (two accounts, Owner and Manager) — explicitly the same dev-only fixture used in local testing since Step 24, never production-appropriate, and never something this deployment's own report should be read as endorsing for a real launch (D-028's real-Supabase-Auth item remains open and tracked).

## A real deployment issue found and fixed: `NEXT_PUBLIC_APP_URL` and stale build caching

The first deployment attempt correctly built and served pages, but every mutating request (booking/event submission, consent grant) failed closed with `403 FORBIDDEN` — this app's own origin/CSRF guard (Step 12/20) rejecting requests whose `Origin` header didn't match its configured `NEXT_PUBLIC_APP_URL`.

Root-caused by direct testing, not guessed: a raw request carrying the exact correct `Origin: https://cladium-cafe.vercel.app` header and a freshly-issued, correctly-paired CSRF token was *still* rejected — ruling out anything client-side and confirming the server's own configured value didn't match. The cause: **Vercel's "Redeploy" action, when reusing the existing build cache, does not necessarily re-bake a changed environment variable into the deployment** — the fix required an explicit fresh rebuild (unchecking "Use existing Build Cache"), not just updating the variable and clicking Redeploy once.

This is a real, generally-applicable operational lesson for this project's own future deploys (including the eventual production one, Step 46): **any change to an environment variable that affects request-time behavior needs a genuinely fresh build to take effect, not a cache-reusing redeploy.** Worth carrying into `docs/database-environments.md` or a future deployment runbook rather than only living in this report.

Verified fixed by direct API testing before moving on to the UI-driven smoke tests below — not assumed fixed from the deploy succeeding.

## Smoke tests — full results

All executed against the live `https://cladium-cafe.vercel.app` deployment, either directly (curl, matching exactly what the real client sends — session cookie, CSRF token, Origin header) or through a real browser (Playwright-adjacent browser automation), never assumed from local behavior.

| Test | Result |
|---|---|
| Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy) present on Vercel's real edge | ✅ Pass — confirmed via direct header inspection |
| `/en` renders correctly, zero console errors | ✅ Pass |
| `/ur` renders correctly, genuinely RTL (`lang="ur" dir="rtl"` confirmed) | ✅ Pass |
| Day/Night theme toggle — instant switch, persists across navigation | ✅ Pass |
| `/en/menu` shows the honest "not published yet" state | ✅ Pass — correct, the menu-publish gate remains separately unmet |
| Real booking submitted end to end (review → confirm) | ✅ Pass — `requestId b8a22bb6-49e5-4525-87c8-001cb8e56331`, state `REQUESTED` |
| Real event enquiry submitted end to end | ✅ Pass — `requestId d7fb50dd-508e-4fb2-a8b8-5213f4ffe219` |
| Double-click (same idempotency key, two submits): exactly one request created | ✅ Pass — both calls returned the identical `requestId a7c79cae-...`, proving the guarantee holds against real, network-attached Postgres, not just the in-memory store this project's own unit tests use |
| Staff sign-in (Owner) and both queues show the correct, matching requests | ✅ Pass |
| Outbox dispatcher manually triggered | ✅ Pass — `{"claimed":3,"delivered":3,"retried":0,"terminal":0}`; all 3 staff notifications correct, payloads confirmed PII-free (only `partySize`/`seatingPreference` for bookings, `guestCount`/`decorInterest` for the event — no guest name/phone in the notification payload) |
| WhatsApp link: correct verified number, correct bilingual prefilled message | ✅ Pass |
| `/en/privacy` consent grant *and* revoke, verified via network log (not just UI state) | ✅ Pass — both round-trip `POST /api/consent` calls returned `200` |
| Disabled-flag routes never crash | ✅ Pass — `/api/whatsapp/webhook` cleanly `404`s; `/api/vapi/token` and `/api/meta/track` fail safely (`400`/`403` depending on which guard layer intercepts first — CSRF/origin runs before the feature-flag check in every case, and neither ever produces a `500`) |
| Text concierge — real chat message | ✅ Pass, after the Anthropic key was added and a fresh (non-cached) rebuild deployed — real, correct, on-brand reply: accurate hours, correct live open/closed status, WhatsApp pointer, `escalate: false` for a simple factual question |
| Voice (Vapi) | Not applicable — deliberately not configured this round (Phase 0's own decision) |

**Every mutating write in the table above is real, guest-visible data now sitting in the staging database** — two bookings and one event request, all clearly marked as test data in their own `notes`/`guestName` fields (e.g. "Test Guest (Step 43 smoke test)", "STEP 43 STAGING SMOKE TEST - safe to ignore/delete"), never anything resembling a real guest submission. These are left in place as-is; Step 44 (owner/staff UAT) is a reasonable point to clear them if the owner wants a clean slate before real user testing, but nothing about their presence blocks anything.

## What this step does and does not prove

**Proves for real, for the first time this project:** the full request lifecycle — guest submission, server-side validation, database write with real RLS enforcement, the outbox/notification chain, and staff-side visibility — all work correctly against genuinely external, network-attached infrastructure (a real Vercel deployment talking to a real hosted Supabase project over the internet), not just this sandbox's local Docker Postgres (Step 42) or in-memory test doubles (every step before that). Also proves the real Anthropic integration works end to end for the first time in this entire project — every prior step's concierge work (Steps 26–29, 39–41) was necessarily built and tested against a fake/absent model client, since no live `ANTHROPIC_API_KEY` ever existed in the local sandbox.

**Does not yet prove:** production-scale traffic or concurrency against this real database (Step 41's load tests remain in-memory-only, D-023's tracked gap); Vapi/voice in any real environment (still untested anywhere); WhatsApp Cloud or Meta measurement (both stay off, per their own unmet gates); real owner/staff UAT on actual devices (Step 44's job); or the real production Supabase Pro backup/PITR mechanism specifically (Step 42's drill used generic `pg_dump`, not Supabase's own managed system).

## Evidence trail

- No application source code changed this step — a clean `docs:`-only commit (this report plus `.continuum/` updates).
- Full live smoke-test results above, each independently verified (network-log inspection, not just UI appearance, wherever that distinction mattered).
- `db:test:schema`/`db:test:rls` both re-run live against the real staging Supabase project and passed.
- Local `npm run verify` remains clean from Step 42 (unaffected, since nothing in `src/`/`tests/` changed).
