# Cladium task ledger

## Active

- [ ] P1 — Step 7: raise Docker Desktop memory to at least 7 GB, then run local `db:start`/`db:reset` smoke. The CLI and all 11 images are available, but the current 4 GB allocation causes Realtime/Storage/Pooler health timeouts; no hosted project is linked.

## Next

- [ ] P1 — Step 8: core content-schema migrations (only after Step 7 local smoke passes).

## Blocked for production, not safe scaffolding

- [ ] Owner menu and Urdu publication approval (menu content itself is structurally verified complete — see `scripts/validate` — this is a sign-off/translation task, not a content-completeness task).
- [ ] Vector/transparent logo and approved photo set.
- [ ] Staff accounts, roles, response/status procedures, MFA ownership.
- [ ] Tax/service-charge and collection-payment rules.
- [ ] Booking/treehouse/event operational details.
- [ ] Privacy, retention/deletion, consent, and legal wording.
- [ ] English/Urdu Vapi real-speaker bake-off.

## Completed

- [x] Research assets and verified operating knowledge collected.
- [x] Menu transcribed and structurally validated.
- [x] Architecture/data model/release gates Version 2 created.
- [x] Claude Code master prompt and gated runbook Version 2 created.
- [x] Legacy contradictions reconciled/deprecated.
- [x] Token-efficient context ledger and source router introduced.
- [x] Step 1 — baseline audit (facts, contradictions, media/gate risk register recorded).
- [x] Step 2 — ADRs 0001–0008 recorded under `cladium-research/architecture/adr/`.
- [x] Step 3 — deterministic validation tooling (`scripts/validate/`) added and run: full PASS; corrected the Step 1 menu-count bug; generated the owner sign-off report.
- [x] Local baseline committed (`8732db0`, not pushed) — research pack, governance, ADRs, validator tooling, placeholder-only `.env.example`.
- [x] Step 4 — Next.js App Router/TypeScript-strict scaffold: install, format, lint, typecheck, unit tests, source validators, and production build all pass; no business features built.
- [x] Step 5 — CI and repository hygiene: GitHub Actions mirrors the local verification chain; secret and client-bundle scans, contribution guidance, protected-branch recommendations, and dependency-update policy added. Full verification passes.
- [x] Step 6 — shared schemas and error conventions: strict boundary parsing, typed results/errors, correlation IDs, redacted structured logs, safe responses, and client/server environment separation. Full verification passes (102 unit tests).

## Update rule

Keep only actionable work here. Move completed items to the short Completed list; put rationale in `DECISIONS.md`, not in task descriptions. After any completed runbook step, refresh the step-completion snapshot (overall/phase, as percentages — not effort) in `PROJECT_STATE.md`'s `## Progress` section; see `CLAUDE.md` Workflow rules for the rule itself.
