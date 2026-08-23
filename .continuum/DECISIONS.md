# Cladium decision ledger

Newest decisions go first. Each entry stays short and points to authoritative evidence.

## D-017 — Database configuration is testable offline; local-stack smoke remains separate

- Decision: commit the Supabase configuration and deterministic routing checks without linking to a hosted project or adding credentials. Keep the local `db:start`/`db:reset` smoke explicitly pending until the developer Supabase CLI is available.
- Why: The CLI is now available after an elevated local download and Docker is running. All 11 images subsequently downloaded, but Docker is allocated 4 GB and the full Supabase stack requires at least 7 GB; Realtime/Storage/Pooler therefore timed out during health checks. Offline invariants and the complete application verification chain pass; claiming a reset smoke without a healthy stack would be false evidence.
- Evidence: `supabase/config.toml`, `scripts/db/check-db-config.mjs`, `docs/database-environments.md`, `npm run verify`.

## D-016 — Client and privileged environment modules stay physically separate

- Decision: `src/lib/env.ts` may contain only `NEXT_PUBLIC_*` schema symbols; privileged variables and feature flags live in `src/lib/env.server.ts`, which asserts server-only status at module load.
- Why: a runtime guard on individual functions still permits a client-importable module to include privileged environment schema names. Physical separation reduces accidental client bundling and makes the contract testable.
- Evidence: `tests/unit/server-boundary.test.ts`, `npm run verify` (full client-bundle leak scan passes).

## D-015 — D-014 was itself wrong; restored 118-item count with tooling behind it

- Decision: supersede D-014. The verified figure is 118 items / 12 categories / 100 single-price / 18 variant-price / 0 missing prices / 8 source pages / 0 empty categories — matching the original pre-audit claim, not the "52 items / 4 empty categories" figure D-014 recorded.
- Why: Step 1's ad hoc one-off script only read `category.items`. Four categories (Steaks, Burgers, Bar Menu, BBQ) store their items one level deeper, under `category.groups[].items`, so the script saw them as empty. Building the real Step 3 validator (`scripts/validate/validators/menu.mjs`), which walks both shapes, reproduced the original 118/100/18/0 figures exactly and found zero empty categories.
- Evidence: `node --test "scripts/validate/**/*.test.mjs"` (11/11 pass) and `node scripts/validate/run-all.mjs` (PASS, zero errors/warnings), implemented at `scripts/validate/` (not yet committed to git); report at `cladium-research/data/validation/owner-signoff-report.md`.
- Lesson: prefer the checked-in validator over a throwaway inline script for any claim that ends up in `.continuum/`; a script that only handles the shapes it happens to sample will silently misreport the shapes it doesn't.

## D-014 — Menu completeness correction (superseded by D-015)

- Decision: replace the stale "118 items" claim with the deterministically verified count — 52 items, 12 categories, 39 single-price, 13 variant-price, zero missing prices, eight source pages — and record four zero-item categories (Steaks, Burgers, Bar Menu, BBQ) as a Gate 2 source-image/owner reconciliation issue, not something to fabricate.
- Why: Step 1 baseline audit re-derived counts from `data/menu.json` with a deterministic script; the prior figure did not match the source file.
- Evidence: `PROJECT_STATE.md` menu line; Runbook Step 1 audit output.
- **Correction:** this count was itself wrong — see D-015. The script behind it did not walk `groups[].items`.

## D-013 — ADR location

- Decision: record architecture decision records at `cladium-research/architecture/adr/000N-slug.md`, indexed by a local `README.md`.
- Why: `context-routing-v2.md` already references "relevant ADR" alongside `production-architecture-v2.md`; nesting ADRs under `architecture/` keeps them next to the source-of-truth docs they justify, distinct from the lower-authority `.continuum/` summary layer.
- Revisit: none planned; add new ADRs by incrementing the number.

## D-012 — Local context layer until supplied CONTINUUM is accessible

- Decision: use `.continuum/` compact Markdown state and targeted source routing without installing third-party code.
- Why: `https://github.com/AShakeel/CONTINUUM` returns 404 and the account shows no public repositories as of 2026-08-23.
- Revisit: attach the repository ZIP or make it accessible; then inspect license, code, hooks, data handling, and tests before installation.

## D-011 — Production deployment

- Decision: Next.js App Router/TypeScript strict on Vercel Pro with Supabase Pro.
- Why: one deployable application, production persistence/auth/RLS/realtime/backups, and portable domain adapters.
- Source: `architecture/production-architecture-v2.md`.

## D-010 — Honest commerce boundary

- Decision: launch supports pending takeaway, booking, treehouse, and event requests—not instant commerce or availability.
- Why: there is no live kitchen/table/payment source of truth.

## D-009 — Voice security and quality

- Decision: Vapi Web SDK with server-issued short-lived JWTs, separate EN/UR assistants, HMAC/replay/idempotency controls, no recording, and visible tap submission.

## D-008 — Database before workflows

- Decision: production-shaped PostgreSQL migrations, RLS, separate state machines, confirmation tokens, idempotency, audit, and outbox precede functional request features.

## D-007 — Languages and themes

- Decision: English and Urdu UI/text/audio plus Urdu RTL and accessible persistent Day/Night themes are mandatory at launch.

## D-006 — Integrations behind flags

- Decision: WhatsApp Cloud, Meta marketing, online payment, delivery, recording, accommodation, and public phone voice start disabled and require separate gates.

## D-005 — Menu governance

- Decision: existing JSON is source evidence; normalize into versioned unpublished database records with stable IDs, integer PKR and tri-state availability. Owner publishes.

## D-004 — Media honesty

- Decision: supplied video is interaction reference only; do not ship third-party artwork. Do not fabricate venue/food imagery, reviews, or promotions.
