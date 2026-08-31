# Step 45 — Production Readiness Decision

**Date:** 2026-08-31
**Evaluated against:** `cladium-research/operations/release-gates-v2.md` (Gates 0–9)
**Tested commit:** `7c31fce` (Step 44 close-out; last application-code change was `428f105`, Step 43)
**Environment evaluated:** staging (`https://cladium-cafe.vercel.app`, Vercel Hobby, Supabase `vxvpxywszskxcugwpsch`, region `ap-northeast-1`)
**Database migration version:** 13 migrations, all applied (`20260830044140` latest)
**Menu version:** unpublished (owner sign-off outstanding)
**Vapi assistant versions:** none deployed (Step 34 deferred)

## Decision: **NO-GO**

Per the gate document's own rule ("a gate is either evidenced as passed, explicitly deferred behind a disabled feature flag, or launch is blocked"), several gates have items that are neither passed nor cleanly deferred — they are genuinely unbuilt or unresolved. This is the expected, correct state at this point in the project, not a surprise: every open item below has been tracked since the step that found it. Nothing in this report should be read as new bad news — it is Step 45's job to consolidate what was already known into one explicit decision point, and it does surface a small number of genuinely new findings (flagged below) that no prior step happened to check.

No deployment action is taken in this step, per the runbook's own instruction.

## Gate-by-gate summary

| Gate | Status | Detail |
|---|---|---|
| 0 — Owner decisions and rights | **NO-GO** | All 10 items are real business/content decisions only the owner can make. None are done. See "Owner decisions" below. |
| 1 — Scope and truthful UX | **Partial — one real gap** | CTAs, absence of delivery/payment/accommodation, staff-confirmed language, and no placeholder content are all correct and verified. **Gap**: `FEATURE_TAKEAWAY_REQUESTS`/`FEATURE_BOOKING_REQUESTS`/`FEATURE_EVENT_REQUESTS` are declared but never read by the guest-facing routes (found Step 24, still open) — "reject direct calls to disabled routes" is not actually true for these three. |
| 2 — Content and menu integrity | **Pass (mechanism); NO-GO (publication)** | Import/validation/snapshot mechanics are all built and tested. The menu itself remains correctly unpublished pending Gate 0. |
| 3 — Database, auth, and authorization | **Partial — one hard blocker** | Isolated dev/staging projects, RLS (live-tested Steps 42–43), state machines/audit/idempotency/outbox are all real and tested. **Hard blocker**: no Supabase Pro, no tested restore against Supabase's actual managed PITR (only local `pg_dump`, Step 42), and — critically — **no real staff authentication or MFA exists at all**. `STAFF_DEV_ACCOUNTS` (D-028) is explicitly dev-only scaffolding; this is not a disabled-flag deferral, it is a missing production auth system. |
| 4 — Request workflow reliability | **Pass** | State machines, review/confirmation-token flow, stale-menu re-review, duplicate-click/idempotency, fail-closed transitions, and atomic request+outbox creation are all built and tested (Steps 19–25, 41). Realtime itself is unbuilt (ADR-0007) but the reliability guarantee this gate actually asks for is provided by the outbox, not Realtime — consistent with the architecture's own stated intent. |
| 5 — Concierge policy and safety | **Partial — one real gap** | Shared policy/tools, untrusted-data handling, loop/token/timeout limits, and adversarial/injection/PII tests all pass (Steps 26–29, 40). **Gap**: the `requiresLiveModel: true` eval cases (12 of 27) have still never actually been run against a live model — a real key has existed in staging since Step 43 but the fuller eval pass hasn't been executed against it (tracked since Step 43). |
| 6 — Vapi bilingual voice | **Deferred (correctly)** | `FEATURE_VOICE_EN`/`FEATURE_VOICE_UR` are `false` everywhere; no assistant, no credential, no bake-off. This is a clean, correctly-disabled deferral, not a gap. |
| 7 — Localization, theme, accessibility, performance | **Partial** | Locale/theme/RTL/hydration and the full Playwright×axe matrix pass (Steps 13–14, 39). Menu browsing correctly works without the carousel, which is itself correctly deferred (D-022). **Gaps**: (a) real P75 field telemetry (LCP/INP/CLS) has never been captured — Step 41's numbers are a local proxy only; (b) per-page canonical/hreflang has a known gap beyond the locale root (Step 39); (c) no photography exists at all, so "responsive/licensed/alt-text images" cannot be evidenced — tied to Gate 0. |
| 8 — Privacy, security, and integrations | **Partial — one process gap (new finding)** | CSP/HSTS/headers, consent categories, PII-free logging, and WhatsApp Cloud/Meta correctly-off are all verified live (Steps 36, 40, 43). **New finding this step**: dependency scanning (`npm audit`) is not part of the automated `verify`/CI chain — it was run once, manually, in Step 40, and never since. This should be a repeatable, automated check before launch, not a point-in-time manual one. |
| 9 — Deployment and operations | **NO-GO** | See "Deployment and operations" below — the largest concentration of open items, several genuinely new findings this step. |

## Owner decisions (Gate 0) — none resolved yet

All ten items remain the owner's to decide; this build process cannot supply them. Unchanged from `TASKS.md`'s "Blocked for production" list: menu/price approval, primary public phone number (the source data explicitly flags this as unconfirmed — only the WhatsApp number is currently public), tax/service-charge rules, takeaway/booking/event operational procedures, décor/cake/outside-food wording (already drafted and shown to guests, but not yet through a formal owner/legal approval pass as this gate item asks), privacy/legal wording, media rights, logo/photo library, and Urdu translation review by a fluent speaker.

## Deployment and operations (Gate 9) — detail

- **Plan and domain**: Vercel Hobby, no custom domain (default `*.vercel.app`). Upgrade to Pro is an explicit, already-tracked owner decision (D-047) — needed before this gate can pass.
- **New finding — function/database region**: the Supabase project is in `ap-northeast-1` (Tokyo). Vercel's Hobby-tier default function region (historically US-based unless explicitly configured) has never been checked against this. If they don't match, every database round trip in production carries unnecessary cross-region latency. **Recommend verifying and, if needed, setting the Vercel project's function region explicitly (e.g. `hnd1`) before the Pro upgrade/production deploy** — this was never checked in any prior step and is a genuinely new item this session surfaces, not a known gap being repeated.
- **CI coverage**: lint/format/typecheck/unit/build/secret-scan/build-output-scan all run automatically (`.github/workflows/ci.yml`); a separate `e2e` job runs the full Playwright + axe matrix. The agent-policy evals run as part of the unit suite. **New finding**: `npm audit` (dependency scanning) has no CI step at all — worth adding as its own job or folded into `verify`, flagged above under Gate 8 too.
- **Branch protection**: not confirmed configured on GitHub (this requires the repository owner's dashboard action, not something visible from the codebase). Recommend the owner verify/enable it before production.
- **Alerting and runbooks**: structured, redacted logs exist (Step 6); Step 41 proposed concrete alert thresholds (outbox failure rate, rate-limit rejection rate, provider-timeout rate) but no live monitoring/alerting stack has ever been wired to them. No formal incident runbook document exists beyond the deployment/database docs already in the repo.
- **Backup/restore and rollback**: proven locally against real Postgres (Step 42, ~11s RTO) and application-rollback safety proven via migration-discipline analysis — but never yet run against Supabase Pro's actual managed PITR mechanism, which is operationally different (WAL-based, dashboard/API-driven). Re-run once Pro exists.
- **Load/concurrency**: proven at the application layer against in-memory stores at real volume (Step 41) — never yet against real Postgres/staging under load.
- **UAT**: Step 44 ran, but as a live collaborative session (Claude driving the real site/database under the owner's direction), not independent real-device staff testing — tracked as an open follow-up.
- **Named contacts**: launch owner, incident contact, rollback decision-maker, and monitoring window remain unrecorded — open since Step 42, still open after Step 44.

## What would move this to GO

**Owner/business items** (this build process cannot supply these):
1. Approve menu names/variants/prices, and publish the menu.
2. Confirm the primary public phone number.
3. Document tax/service-charge, request-operational, and décor/cake/outside-food policies formally.
4. Provide owner/legal-reviewed privacy and consent wording.
5. Supply a licensed logo and photo library; get a fluent speaker to review Urdu translations.
6. Upgrade Vercel to Pro; register a custom domain.
7. Name a launch owner, incident contact, rollback decision-maker, and monitoring window.
8. Decide on and staff a real notification-response procedure.
9. Approve a genuine independent staff UAT round on real devices.

**Engineering items** (this build process can do these once scheduled):
1. Build real Supabase Auth + owner/manager MFA, replacing `STAFF_DEV_ACCOUNTS` (D-028) — the one hard technical blocker in Gate 3.
2. Wire `FEATURE_TAKEAWAY_REQUESTS`/`FEATURE_BOOKING_REQUESTS`/`FEATURE_EVENT_REQUESTS` into their actual routes (Gate 1 gap, open since Step 24).
3. Run the remaining `requiresLiveModel: true` eval cases against the real staging key (Gate 5 gap, open since Step 43).
4. Automate `npm audit` into CI (new finding this step).
5. Verify/fix the Vercel↔Supabase function-region alignment (new finding this step).
6. Capture real P75 field telemetry once meaningful staging/production traffic exists.
7. Re-run the backup/restore and load/concurrency drills against real Supabase Pro once upgraded.
8. Build and wire real alerting against Step 41's proposed thresholds.

## Evidence trail

Full detail behind every line above lives in this project's own step-by-step record: `.continuum/DECISIONS.md` (D-001 through D-048), `.continuum/TASKS.md`'s Next and Blocked-for-production lists, and each cited operations report (`security-abuse-verification-report.md`, `performance-resilience-report.md`, `backup-restore-rollback-drill-report.md`, `staging-release-report.md`, `owner-staff-uat-report.md`). No new claim in this report was made without a specific prior step's evidence or a live check performed this step.
