# Contributing to Cladium Café & Resort

Read `CLAUDE.md` first — its non-negotiable operating rules (no delivery, request-only CTAs, no invented menu/price/availability facts) override convenience at every step. Work one Version 2 runbook step at a time.

## Prerequisites

- Node.js 24.x (the repo is developed and CI-tested on 24; `npm ci` and the build are verified there)
- npm 11.x — npm is the package manager for this repo. ADR-0001 proposed pnpm, but pnpm is unavailable in the current build environment; if that changes, switching is a deliberate, separately reviewed change (new lockfile, CI update, ADR amendment).

## Commands

| Command                     | What it does                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `npm ci`                    | Clean, lockfile-verified install. Use this, not `npm install`, when reproducing CI. |
| `npm run dev`               | Local dev server                                                                    |
| `npm run build`             | Production build                                                                    |
| `npm run format`            | Prettier check (no writes)                                                          |
| `npm run format:write`      | Prettier write                                                                      |
| `npm run lint`              | ESLint                                                                              |
| `npm run typecheck`         | `tsc --noEmit`, strict                                                              |
| `npm test`                  | Vitest unit tests                                                                   |
| `npm run test:scripts`      | Node built-in tests for `scripts/**` tooling                                        |
| `npm run validate:sources`  | Deterministic business/menu/asset validators + owner sign-off report                |
| `npm run scan:secrets`      | Secret scan over the working tree                                                   |
| `npm run scan:build-output` | Assert no server-only values reached the client bundle (run after `build`)          |
| `npm run check:db-config`   | Database connection-routing invariants (needs no Docker or CLI)                     |
| `npm run verify`            | Everything above, in CI order — run this before opening a PR                        |

## Database commands

These require Docker Desktop and the Supabase CLI (invoked via `npx supabase`; deliberately not a project dependency). They are **not** part of `npm run verify` or CI, which must stay runnable without Docker.

| Command                                      | What it does                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run db:start` / `db:stop` / `db:status` | Local Supabase stack lifecycle                                                           |
| `npm run db:reset`                           | Drop and re-apply every migration from clean — the check that matters before a schema PR |
| `npm run db:migration:new -- <name>`         | Create a new timestamped migration file                                                  |
| `npm run db:diff -- -f <name>`               | Capture local schema changes as SQL (review the output before committing)                |
| `npm run db:types`                           | Regenerate `src/lib/db/database.types.ts` from the local database                        |

Environment isolation and the pooled-vs-direct connection rules: `docs/database-environments.md`.

## Continuous integration

`.github/workflows/ci.yml` runs the same gates as `npm run verify` on pushes and pull requests to `main`/`master`. CI intentionally builds **without any real credentials**: nothing in the application may require a secret to compile, and a missing secret must never be substituted with a placeholder to make a build pass.

## Secrets

- Never commit a real `.env`. Only `.env.example` may exist, and only with placeholder values.
- Keep every credential server-side. Never put a private key, database/service-role credential, Anthropic key, Meta/WhatsApp token, or Vapi signing key behind a `NEXT_PUBLIC_*` name.
- If a credential is ever exposed, rotate it first, then clean history. Removing the line alone is not sufficient.
- `npm run scan:secrets` reports the file, line, and pattern name — never the matched value — so CI logs stay safe.

## Branch protection (recommended settings for `main`)

These are recommendations to configure in the hosting provider; they are not enforceable from inside the repository:

- Require a pull request before merging; no direct pushes to `main`.
- Require the `verify` CI job to pass before merging.
- Require branches to be up to date with `main` before merging.
- Require at least one approving review; dismiss stale approvals on new commits.
- Require conversation resolution before merging.
- Restrict force-pushes and branch deletion.
- Apply the rules to administrators too.

## Dependency update policy

- Keep the lockfile committed; `npm ci` must always reproduce the tested tree.
- Update dependencies deliberately, in their own change, never bundled with a feature.
- After any dependency change, run `npm run verify` **and** `npm ls` — `npm ls` must exit 0 with no `invalid`/`ELSPROBLEMS` peer errors.
- Prefer the current supported stable major, **except** where a direct dependency's peer range forbids it. Document any such pin at the point of use, with the evidence and a re-check trigger.
- **Known pin — ESLint 9, not 10:** `eslint-config-next@16.3.2` (npm `latest`, matching our Next.js version) bundles `eslint-plugin-import`, `eslint-plugin-react`, and `eslint-plugin-jsx-a11y`, whose published peer ranges all cap at `eslint ^9`. Installing `eslint@^10` yields `ELSPROBLEMS`/`invalid` in `npm ls`. npm's own dist-tags list `9.39.5` as the `maintenance` line. The npm deprecation warning on `eslint@9.39.5` is therefore expected and accepted. Re-check by re-running the `^10` install and `npm ls` the next time `eslint-config-next` is upgraded — see the note in `eslint.config.mjs`.
- Run `npm audit` on dependency changes; triage anything above low severity before merging.

## Source data is authoritative

`cladium-research/**` is the approved knowledge base. Do not reformat, flatten, or "fix" `menu.json` / `business-profile.json` to make code simpler — normalize through adapters instead. The menu validators pin verified totals (118 items / 12 categories); if a source change is genuine and owner-confirmed, update `VERIFIED_MENU_BASELINE` by hand and record it in `.continuum/DECISIONS.md`.
