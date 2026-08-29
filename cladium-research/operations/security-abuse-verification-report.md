# Security and abuse verification report

Runbook Step 40, `release-gates-v2.md` Gate 8's own bullet: "Secret scanning, dependency scanning, authorization tests, injection tests, webhook spoof/replay tests, and abuse tests pass." This report is the signed evidence trail the step's evidence bullet asks for — a matrix of every named area, what was checked, what was found, what was fixed, and what remains explicitly tracked rather than silently skipped.

**Tested commit:** `PENDING` (this step's own commit — amended in once known, matching this project's established `PROJECT_STATE.md` self-reference pattern).
**Tested environment:** local sandbox, `next dev` (Steps 1–39's standing environment) plus, for the two findings below that specifically needed it, a real `next build && next start` production server. No live Supabase/Postgres, no live Vapi/Anthropic/Meta/WhatsApp credential exists in this sandbox (D-017 and every step since) — findings that need one are marked so explicitly, not silently assumed clean.

## Summary

Three real, previously-unverified gaps were found and fixed this step:

1. **Only 2 of 34 API routes had any rate limit at all.** Every guest-mutation route (cart edits, request review/submit, consent, client-triggered Meta tracking) and the staff sign-in credential-guessing surface had no throttle whatsoever before this step.
2. **`lib/security/headers.ts`'s CSP/HSTS/X-Frame-Options/Permissions-Policy/Referrer-Policy — fully built and unit-tested since Step 12 — were never actually applied to any response.** `next.config.ts` had no `headers()` at all. This app shipped zero of these headers in practice, in every environment, since Step 12.
3. **A real, reproduced cross-component session race in `/concierge`** (found while re-verifying the E2E suite after fixes 1–2, not caused by either of them): `ConciergeChat` (Type mode) fires its own session-minting `GET /api/session/csrf` on mount; a guest who immediately taps "Talk" unmounts it before that fetch resolves (the fetch itself isn't aborted) while the sibling `VoicePanel` mounts and fires its own `GET /api/consent` — under full-suite load, the stale `ConciergeChat` response occasionally lands last and silently overwrites the session cookie `VoicePanel` already captured a CSRF token for, so its next mutating call fails `403 FORBIDDEN`. The same class of bug Step 39 already fixed *within* `VoicePanel` (two parallel fetches racing), now found *across* the two sibling components the mode toggle switches between.

All three are fixed and verified below. No critical/high issue found this step was left unremediated.

## Authorization and RLS (Gate 3, Gate 8)

- **Staff role enforcement**: unchanged this step — already built and tested (Step 24: `performStaffTransition`/`performStaffAssignment`'s per-entity authorization matrix, AUDITOR read-only-by-omission across all three request types; Step 39: `tests/e2e/staff-roles.spec.ts` re-proves it live, in a real browser, against a real session cookie — owner/manager/auditor each seeing exactly their permitted actions). No new gap found.
- **RLS**: `npm run check:db-config` re-run fresh this step — confirms all 12 migrations apply offline-clean and all 28 tables have RLS enabled (structural, no live database needed). `scripts/db/rls-tests.sql` (Step 10, 396 lines, full anon/two-independent-guests/five-staff-roles/service_role allow-deny matrix) was **not re-run live this step** — no Docker/Supabase stack is running in this sandbox (confirmed: `docker info` fails to reach the daemon). This is the same standing D-017 limitation every step since Step 10 has carried, not a new gap; re-running it live is tracked in `.continuum/TASKS.md` for whenever a live database is available.

## CSRF/origin (Gate 8)

Unchanged this step — already built (Step 12: `lib/security/csrf.ts`'s stateless double-submit token bound to session ID, `lib/security/origin.ts`'s exact-match allowlist against the server's own configured `NEXT_PUBLIC_APP_URL`, never a request-derived Host header) and re-proven live this step: every one of the 10 rate-limit-wired routes still passes its existing CSRF/origin guard unchanged (`parseMutatingRequest`'s new `rateLimit` option runs *after* session resolution but *before* CSRF verification — a deliberate ordering choice, see `mutating-route.ts`'s doc comment). `tests/e2e/rate-limiting.spec.ts`'s own successful-call assertions are indirect proof CSRF/origin still pass correctly end to end through a real browser.

## XSS/injection

Confirmed structural, not merely tested-and-hoped: a source-wide scan (`grep -rn "dangerouslySetInnerHTML|innerHTML|outerHTML|eval\(|new Function\(" src/`) found **zero matches** anywhere in this codebase. Every rendered value goes through JSX's own escaping; there is no code path that could ever inject unescaped HTML or execute a string as code, guest-supplied or otherwise. Every mutation route's input is parsed at the boundary through a strict (`.strict()`) zod schema (`lib/schemas/parse.ts#parseAtBoundary`, Step 6) before any service code sees it — an unknown/extra field is a validation error, not silently accepted.

## SSRF (where relevant)

Confirmed structural: every outbound `fetch()` call in `src/modules/integrations/` (the only place this app makes outbound HTTP calls at all — `whatsapp-client.ts`, `meta-client.ts`) targets a fixed `https://graph.facebook.com/...` URL, with only server-side-*configured* credential path segments (`phoneNumberId`, `datasetId` — from env vars, never guest input) ever interpolated into it. No code path anywhere constructs an outbound request URL from guest-supplied input. `vapi-client.ts` makes no outbound HTTP call at all (JWT signing only — the browser's own `@vapi-ai/web` SDK calls Vapi directly, not this server). The Anthropic client uses the official `@anthropic-ai/sdk`, which targets Anthropic's own fixed API host. **No SSRF surface exists in this codebase.**

## Request smuggling assumptions

Confirmed, not newly built — both pre-existing:

- `lib/security/request-limits.ts` (Step 12) already documents and enforces "never trust a declared `Content-Length` alone" — `checkBodySize` measures the actual decoded body, exactly the defense against a declared-vs-actual body-length mismatch.
- `lib/security/origin.ts` (Step 12) already never derives the "expected" side of an origin comparison from the request itself (no Host-header trust) — it compares the request's `Origin`/`Referer` against a fixed, server-configured allowlist (`parseAppUrl()`), immune to a spoofed/forwarded Host header.
- New this step: `route-rate-limits.ts`'s `STAFF_SIGNIN_RATE_LIMIT_RULE` is **deliberately keyed by the attempted staffId, not client IP** — this sandbox has no live Vercel deployment to confirm `x-forwarded-for`'s real, trustworthy shape (single edge-set hop vs. a guest-appendable list), and trusting an unverified proxy header for a security control would be a false sense of protection, worse than an honestly-scoped per-account limit. Tracked in `.continuum/TASKS.md` as a Step 43 (staging release) follow-up, once a real Vercel environment exists to verify the header against.

## Webhook spoof/replay

Unchanged this step, re-confirmed: Vapi (Step 32, `modules/voice/webhook-auth.ts` — HMAC-SHA256 + timestamp freshness + `toolCallId`/event-body-hash replay dedupe, 39 focused tests) and WhatsApp (Step 38, `modules/integrations/whatsapp-webhook-auth.ts` — Meta's real `X-Hub-Signature-256` raw-body HMAC plus the separate `hub.verify_token` handshake, confirmed against Meta's current public docs, 1 dedicated test file). Both fail closed (401/404) when unconfigured or malformed, live-checked in a real browser both when originally built and again in Step 39's E2E run (`whatsapp-handoff.spec.ts`, `concierge-shell.spec.ts`'s voice-call-failure path). No new gap found.

## Rate-limit and abuse (Gate 8) — fixed this step

Before this step, only `POST /api/vapi/token` (5/min, Step 31) and `POST /api/concierge/chat` (10/min, enforced inside `orchestrateTurn` itself, Step 27) had any rate limit. Every other guest-mutation route, and the staff sign-in credential-guessing surface, had none.

Fixed: `src/lib/http/route-rate-limits.ts` (new) — one shared, process-lifetime in-memory `RateLimiter` (same D-023 in-memory-is-dev-only caveat as every other store here), with per-route-group `RateLimitRule` constants, each key namespaced by an explicit `keyPrefix` so sharing one limiter instance across many routes is safe:

| Rule | Window | Max | Applies to |
|---|---|---|---|
| `CART_MUTATION_RATE_LIMIT_RULE` | 60s | 30 | `POST /api/takeaway/cart/items`, `PATCH`/`DELETE /api/takeaway/cart/items/[cartLineId]` |
| `REQUEST_REVIEW_RATE_LIMIT_RULE` | 60s | 20 | `POST /api/{takeaway,bookings,events}/review` |
| `REQUEST_SUBMIT_RATE_LIMIT_RULE` | 60s | 10 | `POST /api/{takeaway,bookings,events}/submit` |
| `CONSENT_RATE_LIMIT_RULE` | 60s | 20 | `POST /api/consent` |
| `META_TRACK_RATE_LIMIT_RULE` | 60s | 60 | `POST /api/meta/track` |
| `STAFF_SIGNIN_RATE_LIMIT_RULE` | 60s | 5 | `POST /api/staff/session` (keyed by attempted staffId) |

`lib/http/mutating-route.ts#parseMutatingRequest` gained an optional `rateLimit` parameter (checked right after session resolution, before JSON parsing — cheap-first, same reasoning as the content-type/body-size checks ahead of it) — every one of the 10 guest-mutation routes above now passes one. Deliberately **not** extended to already-authenticated staff transition/assignment routes this step — real abuse there is a compromised-account problem a request throttle doesn't solve; tracked as a considered-and-scoped-out decision, not an oversight.

Verified two ways: `tests/unit/route-rate-limits.test.ts` (6 tests — rule sanity, key-namespace isolation at the primitive level) and, more importantly, a **new, genuine end-to-end proof** — `tests/e2e/rate-limiting.spec.ts` (3 tests) hits the real `POST /api/consent` and `POST /api/staff/session` routes through a real browser `fetch()` against the real dev server: confirms exactly `max` calls succeed and the next one is `429`, confirms a different session is unaffected, and confirms the staff-signin limiter locks out further attempts safely (never a crash). All 9 device-project runs (3 tests × mobile/tablet/desktop) pass.

## Prompt injection (Gate 5, Gate 8)

Unchanged this step, unrelated to the two fixes above — already covered by `modules/evals/` (Step 29, adversarial-injection eval cases across all 11 runbook-named categories) and `orchestrator.ts`'s own structural guarantees (Step 27: `system` is always exactly `CONCIERGE_SYSTEM_POLICY`, never guest-influenced; client-supplied history/tool results are treated as untrusted data, never re-interpreted as instructions). No new gap found.

## Dependency scan

`npm audit` (fresh run this step): **0 vulnerabilities** at every severity (info/low/moderate/high/critical), across 500 total dependencies (40 production, 423 dev, 92 optional, 0 peer).

## Secret scan

`npm run scan:secrets` (fresh run this step, 12 patterns): **PASS** — no secrets, tokens, private keys, or disallowed `.env` files in the working tree.

## Client-bundle scan

`npm run scan:build-output` (fresh run this step, against a real production build): **PASS** — no secrets or server-only values found in the 23 scanned client assets.

## CSP/HSTS/security headers (Gate 8) — fixed this step

`lib/security/headers.ts#securityHeaders()`/`buildContentSecurityPolicy()` were fully built and unit-tested since Step 12 (36 focused tests at the time), but **never actually applied to any HTTP response** — `next.config.ts` had no `headers()` function at all, and no route ever called `applySecurityHeaders`. This app shipped none of CSP, HSTS, X-Frame-Options, Permissions-Policy, or Referrer-Policy, in every environment, for the entire project until this step.

Fixed: `next.config.ts` now calls `securityHeaders()` for every route via a static (no per-request nonce) `headers()` entry, applied only outside `next dev` (see below). Because no per-request nonce is generated, `script-src`/`style-src` fall back to `'unsafe-inline'` — the honest, functioning baseline Next.js's own framework-injected inline hydration scripts require without one (confirmed against Next.js's own current documentation, `nextjs.org/docs/app/guides/content-security-policy`, via live `WebSearch`/`WebFetch` before implementing — the same "verify against real docs before shipping a guess" discipline this project has applied throughout). This app has no inline script/style of its own to protect (confirmed above, zero matches), so `'unsafe-inline'` here only ever covers Next.js's own required bootstrap.

A real nonce-based CSP (dropping `'unsafe-inline'` entirely) needs every page to opt into dynamic rendering — Next's own documented requirement — and this app still has three statically-rendered routes (`/`, `/_not-found`, `/staff`, per the build's own route table). Converting those is a genuine, separately-scoped architectural decision (loses static generation/ISR site-wide) and was deliberately **not** folded into this fix; tracked in `.continuum/TASKS.md`.

**Live-verified, not just built**: applying this fix broke `next dev` outright on first attempt — `X-Content-Type-Options: nosniff` made the browser refuse to execute `_next/static/development/_clientMiddlewareManifest.js` (served by Turbopack's dev tooling with an `application/json` content type despite being loaded as a script), which crashed Turbopack's own dev overlay and blanked the page. Confirmed this is a `next dev`-only Turbopack tooling quirk, not a defect in the headers or this app, by verifying clean against a real `next build && next start` production server instead: `curl` confirmed every header present exactly as built; a fresh browser tab showed no console errors on `/en`, `/en/book`, and `/staff`; the Day/Night theme toggle was click-tested and switched instantly with no errors, proving client-side hydration/interactivity is fully intact under the new policy. `headers()` now returns `[]` in `next dev` specifically to avoid the Turbopack interaction — meaning the Step 39 E2E suite (which runs against `next dev`) never exercises these headers; Step 43 (staging release) is the next point a real deployed environment can verify them end to end.

`connect-src` remains `'self'` only — no browser code calls any external origin yet (Vapi's web SDK and a live Supabase browser client are both still unwired, D-035/D-023). Before `FEATURE_VOICE_EN`/`FEATURE_VOICE_UR` are ever enabled in a real environment, Vapi's actual required browser-SDK origins must be confirmed and added via `securityHeaders({ connectSrc: [...] })`'s already-built extension point, or voice calls will fail silently under this CSP — tracked in `.continuum/TASKS.md`.

Evidence: 4 new/extended tests in `tests/unit/security-primitives.test.ts` (no-nonce `'unsafe-inline'` fallback, nonce drops the fallback, `allowEval` dev-only gating, frame-ancestors/object-src/upgrade-insecure-requests present with or without a nonce).

## Consent categories (Gate 8)

Unchanged this step — already distinct (`ESSENTIAL_PREFERENCES`/`META_MARKETING`/`MICROPHONE`/`RECORDING`, Step 36). No new gap found.

## Concierge session race (Gate 5, Gate 6) — fixed this step

Found while re-verifying the E2E suite after fixes 1–2 above (first full run: 247/249, both failures in `concierge-shell.spec.ts`'s Talk-mode Start-Call test). Raising the assertion's timeout from 15s to 25s (the initial hypothesis — full-suite CPU contention slowing an already-flagged-as-slow route) did **not** fully resolve it — one failure persisted on a second full run, disproving pure timing and prompting a proper investigation.

Root cause, confirmed from the failing test's own captured network trace: the `POST /api/consent` call that should grant microphone consent carried a *different* session cookie than the two preceding `GET /api/consent` calls that had supplied its CSRF token — a genuine session/token mismatch, `403 FORBIDDEN`, not a slow response. Tracing it to source: `ConciergeModeToggle` renders either `ConciergeChat` (default "Type" mode) or `VoicePanel` (Talk mode) via a ternary — never both, but `ConciergeChat` always mounts first (the default) and fires its own session-minting `GET /api/session/csrf` immediately. A guest who taps "Talk" right away unmounts `ConciergeChat` before that fetch resolves; unmounting only discards its *state update*, not the *in-flight request itself*, which still reaches the server and still gets a `Set-Cookie` response. Meanwhile `VoicePanel` mounts and fires its own `GET /api/consent`. Under full-suite load, the stale `ConciergeChat` response occasionally resolves *after* `VoicePanel`'s, silently overwriting the browser's session cookie with a session `VoicePanel` never saw. `handleGrantMicrophoneConsent`'s existing error handling only surfaces a message on a *thrown* exception, not on a non-`ok` response — so the failure was also silent in the UI (the button just never changed), which is exactly why it read as "slow" at first glance.

This is the same class of bug Step 39 already fixed *within* `VoicePanel` (D-043 — two parallel fetches inside one component racing); this is the *cross-component* version, between `VoicePanel` and its sibling `ConciergeChat`, which Step 39's fix never touched.

Fixed by lifting the one session/consent-bootstrap fetch to the shared parent, `ConciergeModeToggle` — it now fetches `GET /api/consent` exactly once on mount (regardless of which mode is showing) and passes `csrfToken`/`microphoneConsent` down as props to both children, plus an `onGrantMicrophoneConsent` callback `VoicePanel` calls instead of managing its own consent-POST. Neither child can independently mint a session anymore while rendered inside the toggle. `page.tsx`'s *other* caller of `ConciergeChat` — the voice-unavailable page, where no sibling exists to race with — still renders it standalone with no `csrfToken` prop at all; `ConciergeChat` tells the two callers apart via `providedCsrfToken !== undefined` and falls back to its original self-managed `GET /api/session/csrf` fetch only in that standalone case, preserving its exact original behavior there.

Verified: `tests/e2e/concierge-shell.spec.ts` (all 15 cases across mobile/tablet/desktop) passes cleanly on its own; a fresh full 249-test suite re-run confirmed no regression (see Evidence trail). No unit tests exist for these components (none exist anywhere in this project for React components — this codebase's established convention is live/E2E verification for UI wiring, unit tests for pure logic).

## Evidence trail

- `npm run verify` (format, lint, typecheck, unit tests, source validators, script tests, `check:db-config`, secret scan, production build, client-bundle scan): **clean**.
- Unit tests: **1037 passing** (86 files) — up from 1027 at Step 39's end (10 new: 6 in `route-rate-limits.test.ts`, 4 in `security-primitives.test.ts`).
- `eslint.config.mjs` gained `playwright-report/**`/`test-results/**` ignores — found live: `npm run lint` failed with 186 errors against Playwright's own minified trace-viewer bundle once a local report existed, since ESLint's flat config doesn't read `.gitignore` (both dirs are already gitignored there). Unrelated to source correctness, fixed in passing.
- E2E tests: full suite re-run this step (240 pre-existing + 9 new `rate-limiting.spec.ts` = 249 across mobile/tablet/desktop). Run 1: 247/249, 2 failures in `concierge-shell.spec.ts`'s Talk-mode Start-Call test (mobile/tablet) — root-caused to the real session race above, not fixed by a timeout bump alone. Run 2 (after the timeout bump, before the real fix): 248/249, 1 failure (tablet) — confirming the race, not pure timing. Run 3, after the real session-race fix: `concierge-shell.spec.ts` alone passes cleanly 15/15 across all three projects. Run 4 (final, full suite): **248/249** — zero `concierge-shell.spec.ts` failures, confirming the fix holds under full-suite load; the sole failure was an unrelated `matrix.spec.ts` `/ur/privacy` a11y check hitting Playwright's own 30s *context-teardown* timeout (not a test-assertion failure) — reproduced clean in isolation (6.0s) immediately after, consistent with resource contention from four consecutive full-suite runs in this session rather than any defect, and untouched by anything this step changed.
- `npm audit`: 0 vulnerabilities.
- `npm run scan:secrets` / `npm run scan:build-output`: both PASS.
- Live browser verification: a real `next build && next start` production server, confirming headers present and full render/hydration/interactivity intact.

## Not re-verified live this step (tracked, not silently skipped)

- `scripts/db/rls-tests.sql`'s full allow/deny matrix — needs a live Postgres/Supabase stack this sandbox does not have running (D-017); the offline structural check (`check:db-config`) was re-run and passes.
- Vapi/WhatsApp webhook signature verification against real Meta/Vapi-issued signatures — no live credential exists here (unchanged since Steps 32/38); only the fail-closed/malformed-input paths are exercised.
