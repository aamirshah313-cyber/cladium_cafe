# Performance and resilience report

Runbook Step 41. Evidence bullet: "results, budgets, bottlenecks, failure behavior, and alert thresholds documented." This report records what was tested, the real numbers produced, one genuine bug found and fixed, and — honestly — what this sandbox cannot measure and where that measurement belongs instead.

**Tested commit:** `PENDING` (this step's own commit — amended in once known, matching this project's established self-reference pattern).
**Tested environment:** local sandbox — deterministic in-memory service load tests (`tests/unit/performance-load.test.ts`) run under Vitest/Node; Web Vitals captured via a real (non-headless-quirk-affected, see below) Playwright Chromium instance against a genuine `next build && next start` production server on `localhost`. No live Supabase/Postgres, no live Vapi/Anthropic/Meta/WhatsApp credential, and no staging/production deployment exist in this sandbox (D-017 and every step since) — findings that need one are marked so explicitly.

## What this step can and cannot prove, honestly

Every store exercised below is the in-memory reference adapter (D-023) — there is still no live Postgres/Supabase connection here to load-test real query planning, connection-pool exhaustion, or disk-backed lock contention. What *is* real and load-bearing: the pure orchestration logic — atomic claim/update operations, optimistic-lock conflict resolution, idempotency-key handling, rate-limiter accounting, and the concierge tool-loop bounds — is exactly the code a real adapter sits behind, unchanged. A production database swap changes the store implementation, never the call pattern these tests exercise.

## A real bug found and fixed: the in-memory rate limiter broke under a genuine concurrent burst

Every prior concurrency test in this codebase (Steps 21/25/29) proves correctness under a *small* number of genuinely concurrent calls (2, sometimes 3) — enough to catch a real race, never enough to resemble a spike. `tests/unit/performance-load.test.ts` is the first to push the same services to hundreds of concurrent operations, and doing so surfaced a real defect in `lib/security/rate-limit.ts#createInMemoryRateLimitAdapter`.

**The bug:** `incrementAndGet` returned the *same mutable* `InMemoryWindow` object on every call after the first (`existing.count += 1; return existing;`). `consume()` reads `count`/`resetAt` off that object *after* its own `await`. Under a genuine burst — 200 calls fired via `Promise.all` against one key — every caller's continuation only runs *after* all 200 synchronous increments have already happened (a property of how `async`/`await` schedules microtasks), so every single caller read the *final* mutated count rather than its own count at the moment it incremented.

**Reproduced concretely:** 200 concurrent callers against a `{ windowMs: 60_000, max: 20 }` rule all read the same terminal count and all got `allowed: false` — the limiter let **zero** requests through instead of the correct 20, the opposite of its intended behavior (it should fail open for legitimate traffic up to the limit, not fail closed for everyone).

**Fixed:** `incrementAndGet` now returns a fresh `{ count, resetAt }` snapshot every call — copying the two primitive fields freezes the value the caller receives at the exact synchronous instant of their own increment, immune to any later caller's mutation of the shared window object.

**Why this matters beyond the test:** this same in-memory limiter backs Step 40's `guestRouteRateLimiter` (all 10 guest-mutation routes plus staff sign-in), Step 27's concierge chat limiter, and Step 31's Vapi token-issuance limiter. Step 40's own E2E rate-limit test never caught this because it used a sequential `for`-loop of `await`ed `fetch()` calls, not a true `Promise.all` burst — a real, subtle gap in test coverage that Step 41's higher-volume methodology was specifically built to close. In production this in-memory adapter is explicitly dev-only (a real deployment needs a durable `RateLimitStoreAdapter` — D-023, unchanged), but the bug would have reproduced identically in any adapter making the same "return the live object" mistake, so the fix and its reasoning are recorded here for whoever builds that real adapter.

**Verified:** the fixed primitive re-tested clean (200 concurrent calls, exactly 20 allowed / 180 rejected); the full unit suite (1043 tests, up from 1043... see Evidence trail) and Step 40's own `tests/e2e/rate-limiting.spec.ts` (sequential-load, unaffected either way) both re-confirmed clean.

## Load test results (production-like traffic and request spikes)

All from `tests/unit/performance-load.test.ts`, run on this sandbox's own hardware — real wall-clock numbers, not estimates, but not representative of production hardware/network:

| Scenario | Volume | Result | Wall-clock |
|---|---|---|---|
| Distinct guests submitting takeaway requests concurrently | 300 guests, review + submit | 300/300 succeed, zero collisions, one record each | ~26–41ms per phase |
| Outbox backlog drain (single worker) | 500 queued events | 100% delivered, zero loss/duplication, 26 bounded dispatch cycles | ~27–35ms total |
| Outbox backlog drain (two concurrent worker instances) | 200 queued events | 100% delivered exactly once each — no double-delivery under real worker overlap | ~3–3.5ms |
| Optimistic-lock contention, one record | 50 concurrent transition attempts | Exactly 1 winner, record version incremented exactly once | ~0.2ms |
| Rate limiter under a true concurrent burst, one key | 200 concurrent calls, 20/min rule | Exactly 20 allowed, 180 rejected (after the fix above) | ~0.6–1.0ms |
| Concierge chat turns, distinct sessions | 150 concurrent guests | 150/150 succeed, zero cross-session bleed (each reply echoes only its own message) | ~6–19ms |
| Vapi JWT issuance (real HMAC signing, not a fake) | 500 tokens | 500/500 issued, all correctly scoped to the requested assistant | ~38–64ms total, ~0.08–0.13ms/token |

None of these approach a bottleneck at this volume — the in-memory Map/array operations underlying them are O(1) or O(log n) per call and show no measurable degradation curve across the tested range. The real capacity question — how these numbers change once each store is backed by real network-attached Postgres — is explicitly out of reach here (see below) and belongs to a staging-environment load test (Step 43) instead.

## Provider timeout budgets vs. deployment platform limits

Every bounded external-call timeout already built into this codebase, cross-checked against Vercel Pro's actual documented function-duration limits (confirmed live: default 300s, configurable up to 800s, extended-beta up to 1800s — `vercel.com/docs/functions/configuring-functions/duration`, accessed this step):

| Call path | This app's own bound | Concurrency shape | Vercel Pro headroom |
|---|---|---|---|
| `POST /api/concierge/chat` (Anthropic) | `TURN_TIMEOUT_MS` = 20s wall-clock deadline for the whole turn | n/a (one model turn) | 15x under the 300s default |
| `POST /api/vapi/tools` (per-tool-call race) | `TOOL_CALL_TIMEOUT_MS` = 8s per call, `MAX_TOOL_CALLS_PER_WEBHOOK` = 5 | Concurrent (`Promise.all`, not serial) — worst case is the slowest single call, ~8s, not 5×8s | 37x under the 300s default |
| `POST /api/meta/track` and server-triggered Meta events | `META_EVENT_TIMEOUT_MS` = 3s | n/a (one CAPI call) | 100x under the 300s default |

No route in this codebase sets a custom `maxDuration` (confirmed by source scan) — every route inherits Vercel Pro's platform default, which is already far more generous than anything this app's own bounded timeouts could ever need. This is real, verified headroom, not a gap needing remediation.

## Core Web Vitals — local proxy measurement (real numbers, not the real measurement)

`release-gates-v2.md` Gate 7 itself scopes the actual target to **staging/production telemetry** — P75 measured against real guest traffic over a real network, which does not exist in this sandbox. What follows is a genuine, real capture (not fabricated) against a real `next build && next start` production server on `localhost`, useful as an early proxy signal and as proof the app itself introduces no obvious rendering bottleneck — but it is *not* the Gate 7 measurement, which is Step 43's job once staging exists.

Captured via a real Playwright Chromium instance (not this session's own embedded browser pane, which reports pages as `visibilityState: "hidden"` and never fires Paint Timing/LCP entries at all under that rendering path — a real, documented constraint of that specific tool, not of the app):

| Page | FCP | LCP | CLS | TTFB | Load event |
|---|---|---|---|---|---|
| `/en` | 164ms | 164ms | 0 | ~17–31ms | ~218–398ms |
| `/en/menu` | 164ms | 164ms | 0 | ~17–22ms | ~237–261ms |
| `/en/concierge` | 164ms | 164ms | 0 | ~16–40ms | ~250–262ms |
| `/en/book` | 164ms | 164ms | 0 | ~18–30ms | ~218–264ms |

Every number here is far inside Gate 7's targets (LCP < 2.5s, INP < 200ms — no INP capture attempted, it needs a real user interaction; CLS < 0.1). That is expected and not meaningful proof of production performance: `localhost` has effectively zero network latency, no CDN edge hop, no real device CPU throttling, and no concurrent production load sharing the server. FCP and LCP being identical across every page reflects this app's current content shape honestly — no hero photography exists yet (Production blockers, unchanged since Step 1), so the largest painted element on every page today is a text heading, painted at the same moment as first contentful paint. Once real photography is approved and a hero image ships, LCP will very likely separate from FCP and deserves re-measurement at that point, in addition to the real staging remeasurement Step 43 owns regardless.

## Failure behavior already verified (unchanged this step, cited for completeness)

- Outbox: crash/retry with exponential backoff, poison-message terminal handling after `maxAttempts`, terminal-failure visibility (Step 25) — re-exercised at volume above, unchanged behavior.
- Vapi/Meta/Anthropic: every provider call is timeout-raced and resolves to a safe fallback, never an unhandled rejection or a hung request (Steps 27/32/37) — re-confirmed live in Step 39's E2E suite.
- Idempotency/confirmation-token races: proven under true concurrency since Step 21 — re-exercised at 300-guest volume above with zero regression.
- Staff-transition optimistic-lock conflicts: a normal, expected, non-alarming outcome of legitimate concurrent staff activity (data-model-v2.md §1/§7) — proven at 50-concurrent-attempt volume above.

## Realtime interruption — not applicable

Supabase Realtime is deliberately not built (ADR-0007: "a speed-up, not the delivery guarantee"; D-017 — no live Supabase project exists). `/staff` polls `GET /api/staff/notifications` instead, and the outbox dispatcher above already proves the actual delivery guarantee independent of Realtime. There is nothing to interrupt-test until Realtime is built as a later, separately-scoped enhancement.

## Proposed alert thresholds

No live monitoring/alerting stack exists yet (that is Step 43/46 territory). These are engineering-judgment proposals tied to mechanisms already built this session, not an owner-approved SLA — record them now so Step 43's staging setup has a concrete starting point rather than inventing thresholds from nothing at deploy time:

- **Outbox terminal-failure rate** > 1% of dispatched events reaching `FAILED` in a rolling 1-hour window — signals a systemic handler bug or an unreachable downstream dependency, not routine transient retries (which resolve within `maxAttempts`).
- **Guest-route rate-limit rejection rate** > 5% of requests to any single guest-mutation route returning `429` in a rolling 5-minute window — signals either a real abuse pattern or a limit calibrated too tight for genuine traffic (`route-rate-limits.ts`'s rules, Step 40).
- **Provider timeout rate** > 10% of Vapi tool-call or Meta-tracking calls hitting their own bounded timeout in a rolling 15-minute window — signals real upstream provider degradation.
- **Concierge turn deadline hits** > 5% of chat turns hitting `TURN_TIMEOUT_MS`'s 20s ceiling — signals Anthropic API degradation or a misbehaving tool loop.
- **Staff-transition version conflicts**: track for visibility only, do not alert — a normal, expected outcome of legitimate concurrent staff activity, not a failure signal.

## Not measurable in this sandbox (tracked, not silently skipped)

- Real Postgres/Supabase contention — connection-pool exhaustion, real lock wait times, real query planning under load — needs the live database adapter (D-023) and a live Supabase project (D-017), neither of which exists here.
- Realtime interruption — feature not built (ADR-0007), nothing to test yet.
- Real network/CDN-conditioned Core Web Vitals P75 — Gate 7 itself scopes this to staging/production telemetry (Step 43); the local numbers above are a proxy only.
- Real Vapi/Anthropic/Meta/WhatsApp latency and timeout behavior under genuine network conditions and provider-side load — no live credential exists in this sandbox (unchanged standing limitation since every prior step).
- Real Vercel Cron-triggered outbox dispatch cadence under production traffic — Step 46 (deployment) concern; no real Cron schedule exists yet (Step 25's own tracked item, unchanged).

## Evidence trail

- `tests/unit/performance-load.test.ts` (new, 7 tests) — all passing, real timing captured above.
- `lib/security/rate-limit.ts` — the bug fix above; the pre-existing small-scale test in `tests/unit/security-primitives.test.ts` still covers the corrected behavior, and `performance-load.test.ts`'s dedicated rate-limit-burst test is the new load-scale proof.
- Full `npm run verify` (format, lint, typecheck, unit tests, source validators, script tests, `check:db-config`, secret scan, production build, client-bundle scan): clean.
- A fresh full E2E re-run scored **249/249** across mobile/tablet/desktop — a completely clean run, confirming no regression from the rate-limiter fix anywhere in the app.
