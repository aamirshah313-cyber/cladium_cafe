# Step 44 — Owner and Staff UAT Report

**Date:** 2026-08-31
**Environment tested:** staging, `https://cladium-cafe.vercel.app` (Vercel Hobby + Supabase project `vxvpxywszskxcugwpsch`), deployed commit `428f105` (Step 43), no application code changed since.
**Companion checklist:** [Owner and Staff UAT](https://claude.ai/code/artifact/38917ccc-eb78-46c3-b307-415203d0540e) (13-section interactive artifact prepared for this step).

## How this round was run

This was a live, collaborative session rather than independent owner/staff device testing: the owner directed the session in real time (choosing what to test, granting permission before any data-writing action, and giving final sign-off), while Claude drove a real browser against the real deployed staging site and a Supabase MCP connection against the real staging database — reading actual rendered pages, actual network responses, and actual database rows rather than assuming behavior from source code. This is **not** the same as the owner and each staff member independently testing on their own phones, which release-gates-v2.md's UAT gate ultimately expects before production. It is recorded honestly as a real, evidence-based functional pass of every testable release-gate dimension, with the owner's explicit approval of the results — not as a substitute for that broader in-person round.

## Results by section

| # | Section | Result | Notes |
|---|---|---|---|
| 1 | Bilingual content & RTL | **Pass** | Brand name stays untranslated in Urdu; layout genuinely mirrors RTL (nav, button order, even the Day/Night control); read through Home/Visit/Menu/Book/Event/Privacy in Urdu — labels translated naturally and grammatically, canonical policy text (décor pricing, no-cakes, no-outside-food, hours) correctly stays in owner-approved English rather than being machine-translated. Minor cosmetic note: "Plan a Birthday" and "Plan your visit" use two different Urdu verbs for "plan" (منصوبہ بندی کریں vs. پلان کریں) — not wrong, just not parallel; worth a look whenever Urdu copy is next revisited, not a blocker. |
| 2 | Day/Night themes | **Pass** | Switched Day↔Night live; measured real contrast ratios via computed styles — Day heading 12.4:1 / links 9.4:1; Night heading 16.2:1 / links 7.9:1 (WCAG AA requires 4.5:1 — both comfortably exceed AAA's 7:1). Theme choice persisted across a full page reload. |
| 3 | Content/menu state | **Pass** | `/menu` shows the honest "our online menu is not available yet" message in both languages, pointing to WhatsApp/Visit — correct, deliberate behavior (menu remains unpublished pending owner sign-off, Gate 0). Live open/closed status on `/visit` rendering correctly. |
| 4 | Request wording | **Pass** | Booking and event forms never suggest an instant confirmation. Found the exact "not yet a confirmed reservation" / "not yet a confirmed quote or booking" disclaimer text on the **post-submit confirmation screen** (not the review screen, which only echoes the entered data) — correct behavior, just one step later in the flow than assumed when the checklist was written. Décor/cake/outside-food policy text renders correctly on the event page, including through the review step. |
| 5 | Takeaway/booking/event operations | **Pass** | Submitted one real (clearly fake, "TEST — UAT Step 44") table request and one event enquiry end to end — both round-tripped `review → confirm` with real `200` responses, both landed correctly in their staff queues. Walked the booking through a real staff transition (`REQUESTED → CONFIRMED`, with a reason), confirmed in the append-only history with the correct actor (`STAFF owner`). Takeaway remains correctly request/pickup-only — no delivery option anywhere. |
| 6 | Staff roles and access | **Pass** (see below — required provisioning one additional test account mid-step) | See "Scoped role testing" below. |
| 7 | Notifications and response procedure | **Partial — owner input still open** | Staff notification queue correctly shows "No notifications yet" (nothing auto-triggers the outbox dispatcher without a real cron — expected, tracked separately for Step 46). The actual staffing question — who checks for new requests, how often, and what happens if nobody responds — remains the owner's to define; not answered in this session. |
| 8 | Concierge (text) policy | **Pass** | Asked real questions against the live Anthropic integration. Hours/delivery question answered correctly (right hours, right live open/closed status, correct no-delivery/yes-takeaway answer) in both English and Urdu. A severe-allergy question was correctly declined rather than guessed at, with a clear hand-off to the real WhatsApp number and an explanation of why. |
| 9 | Voice quality | **Deferred, unchanged** | Step 34's bake-off has not run; no live Vapi assistant exists anywhere. Nothing to test this round, as expected. |
| 10 | WhatsApp handoff | **Pass** | Link resolves to `https://wa.me/923123978889?text=...`, opens in a new tab (`noopener noreferrer`), number matches what's published on `/visit`. |
| 11 | Privacy and consent | **Pass** | Tested a real grant → revoke round-trip on the Meta-marketing consent toggle from the live `/ur/privacy` page — both actions produced real `200` responses from `POST /api/consent`, and the UI label updated correctly and independently of the other two categories. |
| 12 | Launch and rollback contacts | **Not filled in this session** | Real names for launch owner / incident contact / rollback decision-maker / monitoring window remain open — same standing item since Step 42 (D-046). Owner to fill directly in the checklist artifact or provide separately. |
| 13 | Sign-off | **Recorded** | See below. |

## Scoped role testing (Section 6)

The staging `STAFF_DEV_ACCOUNTS` env var originally provisioned only `owner` (OWNER) and `manager` (MANAGER) — both roles with access to every queue, so role-*scoping* itself (as opposed to role sign-in generally) was not actually testable until this was noticed mid-step. With the owner's go-ahead, a third scoped test account was added:

```json
{"staffId":"order_staff","displayName":"Order Staff","roles":["ORDER_STAFF"],"devPassword":"<24-hex-char generated password>"}
```

This took effect on a normal Vercel redeploy with no cache-free rebuild needed — confirming the Step 43 build-cache gotcha (D-047) was specific to `NEXT_PUBLIC_*` client-bundle inlining, not server-only env vars generally, which is a useful clarification for future deploys.

Verified directly against the live API responses (not just page rendering):

| Account | `/api/staff/takeaway` | `/api/staff/bookings` | `/api/staff/events` |
|---|---|---|---|
| owner | 200 | 200 | 200 |
| manager | 200 | 200 | 200 |
| order_staff | 200 | **403** (correct — scoped out, no crash) | **403** (correct — scoped out, no crash) |

Sign-out was also verified to genuinely revoke access — reloading a protected staff page after sign-out correctly bounces to "Not signed in," not a cached/stale authenticated view.

This new `order_staff` dev account now exists in the staging `STAFF_DEV_ACCOUNTS` env var alongside `owner`/`manager`. It is dev-only scaffolding by design (`modules/staff/dev-credentials.ts`, D-028) and carries the same standing requirement as the other two: `STAFF_DEV_ACCOUNTS` must never be set in any production environment, and all three are superseded once real Supabase Auth (Gate 3) ships — no new follow-up item needed beyond the existing one.

## Sign-off

**Owner approval:** given verbally in this session ("go ahead, record it as approved") after reviewing the section-by-section results above, 2026-08-31.

**Staff acceptance:** not independently exercised this round in the sense release-gates-v2.md's UAT gate ultimately expects (real staff, their own devices) — this session's operations/roles testing (Section 5–6) was run by Claude under the owner's direction and approved by the owner in that capacity. Recorded as **owner-approved functional verification**, not staff self-certification. A genuine staff walkthrough (each role signing in on their own device and confirming their own day-to-day workflow makes sense to them) remains open and is tracked below.

## What this proves vs. doesn't yet

**Proven, live, this session:** every release-gate dimension that can be exercised through the deployed app and its real database now has direct, verified evidence — not just passing unit/E2E tests against fakes, and not just static content review. Role-based access scoping is now proven with a real scoped account, not merely asserted from source code.

**Still open, tracked below, not blockers for closing Step 44 itself:**
- A genuine independent staff walkthrough (each real staff member, their own device, their own judgment) — Sections 5–6's mechanics are now proven correct; a person unfamiliar with the build still needs to confirm the workflow *feels* right to actually do all day.
- Notification response procedure (who checks, how often) — an owner staffing decision, not a code question.
- Launch/incident/rollback named contacts (Section 12) — same standing item as D-046.
- The minor Urdu phrasing inconsistency noted in Section 1.
