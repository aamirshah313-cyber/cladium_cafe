# Complete Claude Code execution guide

Status: ready for controlled execution  
Application code: not started  
Authoritative runbook: `CLADIUM_CODE_BUILD_RUNBOOK_V2.md`

This guide tells the operator exactly how to take the prepared Cladium pack from pre-build through staging and production. Use the exact prompt for each numbered runbook step; do not give Claude all 47 prompts at once.

## 1. Understand the control model

There are four layers:

1. `CLAUDE.md` contains permanent project rules Claude Code discovers at the repository root.
2. `.continuum/PROJECT_STATE.md` and `.continuum/TASKS.md` provide a compact cross-session resume.
3. `MASTER_BUILD_PROMPT_V2.md` establishes the complete implementation contract.
4. `CLADIUM_CODE_BUILD_RUNBOOK_V2.md` authorizes one small, testable step at a time.

If documents disagree, follow the source precedence in `architecture/production-architecture-v2.md`. Never let compact memory override verified business facts, the Version 2 data model, or release gates.

## 2. Prepare Windows and Claude Code

Claude Code supports Windows 10+ through WSL or native Windows with Git for Windows. For this existing Windows-path workspace, native PowerShell plus Git for Windows is the simplest starting option. WSL 2 is also valid, but do not mix Windows and Linux Node/npm installations in one build.

Open PowerShell and verify:

```powershell
node --version
npm --version
git --version
claude --version
```

If Claude Code is not installed:

```powershell
npm install -g @anthropic-ai/claude-code
claude doctor
```

Do not use `sudo`, an unofficial installer, or `--dangerously-skip-permissions`. Authenticate through the Claude plan or Anthropic Console option appropriate to the owner. Claude Code credentials do not belong in this repository or `.env.local`.

If native Windows cannot find Git Bash, install Git for Windows. Only for a portable/nonstandard Git installation, set `CLAUDE_CODE_GIT_BASH_PATH` to its actual `bash.exe` path in your user environment.

## 3. Create the safe starting checkpoint

The repository pack is currently untracked. Before scaffolding, use a private remote or a local-only commit. Review first:

```powershell
Set-Location -LiteralPath 'C:\Users\DELL\Documents\ChatGPT\Cladium Cafe'
git status --short
git add .continuum .claude .env.example .gitignore BUILD_START_HERE.md CLAUDE.md cladium-research
git diff --cached --check
git diff --cached --stat
git commit -m "docs: prepare Cladium Claude Code build pack"
```

Do not push to a public repository because owner-provided media and future integration details may have usage/privacy constraints. If Git identity is not configured, configure it deliberately for this repository; do not let an agent invent the identity.

## 4. Understand the project safety configuration

The committed `.claude/settings.json` requires prompts before dependency installation, `npx`, commits, pushes, Vercel commands, Supabase linking, or remote database pushes. It blocks reading/editing real environment files and blocks force pushes, hard resets, and recursive `rm` commands.

Keep `.claude/settings.local.json` untracked. Review Claude Code permissions with `/permissions`; confirm loaded setting sources with `/status`; inspect memory sources with `/memory`.

Never broaden permissions to `Bash(*)`, never enable bypass mode, and never approve a command merely because the agent describes it as routine.

## 5. Start the first Claude Code session

From the repository root:

```powershell
claude --permission-mode plan
```

Inside Claude Code:

1. Run `/status` and confirm the project settings loaded.
2. Run `/memory` and confirm root `CLAUDE.md` loaded.
3. Paste the contents of `MASTER_BUILD_PROMPT_V2.md`.
4. Claude must return the launch boundary, proposed tree, database/RLS sequence, environment inventory, test mapping, blockers, and its proposed first step without editing files.
5. Reject any response that adds delivery, instant availability, automatic confirmations, online payment, accommodation, fabricated content, or production integrations outside the flags.

Then authorize only this:

```text
Execute only Phase 0, Step 1 from CLADIUM_CODE_BUILD_RUNBOOK_V2.md. Follow the compact context router. Make no file changes and do not scaffold. Return the required evidence and stop.
```

## 6. One-step execution cycle

Repeat this cycle for every runbook step:

1. Start from root `CLAUDE.md`, compact state/tasks, and the context router.
2. Paste only the active numbered prompt from the runbook.
3. Ask Claude to state intended files and verification before editing.
4. Approve only the scoped file changes and commands.
5. Require the step's tests/checks to pass.
6. Review `git status --short` and `git diff --check`.
7. Inspect the actual diff, not just Claude's summary.
8. Record blockers; do not silently substitute placeholders.
9. Commit a coherent checkpoint after the step/phase evidence is accepted.
10. Stop before authorizing the next numbered step.

At a phase boundary, update `.continuum/PROJECT_STATE.md`, `.continuum/TASKS.md`, and durable entries in `.continuum/DECISIONS.md`. Start a fresh Claude Code session from that compact state when practical. Use `claude --continue` only for a short interrupted session; carrying a long completed phase forward wastes context.

## 7. Phase-by-phase build sequence

| Phase | Steps | Outcome | Required stop/checkpoint |
| --- | ---: | --- | --- |
| 0 — governance | 1–3 | baseline audit, ADRs, deterministic source validators | Approve architecture and data report before scaffolding |
| 1 — foundation | 4–6 | Next.js strict scaffold, CI, shared validation/errors | Clean install, lint, typecheck, unit smoke, production build |
| 2 — data/security | 7–12 | Supabase migrations, schema, RLS, roles, importer, security base | Local reset/migrations and full allow/deny matrix pass |
| 3 — public UI | 13–18 | `/en`/`/ur`, RTL, Day/Night, shell, location, menu, carousel | Locale/theme/viewport/accessibility matrix passes |
| 4 — operations | 19–25 | deterministic request services, confirmation, staff, outbox | State, idempotency, concurrency, RLS and notification tests pass |
| 5 — text agent | 26–29 | strict tools, bounded Anthropic orchestration, confirmation UI, evals | Critical policy suite passes 100% |
| 6 — Vapi voice | 30–34 | separate EN/UR profiles, short-lived JWT, HMAC tools, web UI, bake-off | Real-speaker quality and voice security gates pass |
| 7 — WhatsApp/Meta | 35–38 | click-to-chat, consent/privacy, flagged Meta, Cloud readiness only | Disabled integrations fail closed; no PII or false purchase events |
| 8 — hardening | 39–42 | E2E/a11y/security/performance/restore/rollback | No critical defect; restore and rollback drills pass |
| 9 — release | 43–47 | isolated staging, UAT, go/no-go, controlled production, monitoring | Explicit GO required before Step 46 |

Use the exact detailed prompt and evidence requirements in the runbook for each step. This table is navigation, not a substitute for those contracts.

## 8. Target repository structure Claude should produce

Claude may refine names in Step 4, but it must preserve these boundaries:

```text
src/
  app/
    [locale]/
    staff/
    api/
  modules/
    business/
    menu/
    takeaway/
    bookings/
    events/
    concierge/
    voice/
    staff/
    integrations/
    consent/
  lib/
supabase/
  migrations/
  seed/
tests/
  unit/
  integration/
  contract/
  e2e/
  accessibility/
  agent-evals/
scripts/
cladium-research/
.continuum/
.claude/
```

Route handlers remain thin. Domain modules own pricing, permissions, workflow transitions, confirmation tokens, idempotency, audit, and outbox behavior. AI/Vapi/Meta/WhatsApp adapters never bypass domain services.

## 9. Environment and account sequence

Use `.env.example` only as a name/exposure contract. A human creates `.env.local` and enters development values; Claude Code is intentionally denied access to real environment files.

| Needed by | Account/configuration | Rule |
| --- | --- | --- |
| Phase 1 | no production account | Scaffold and CI can use local placeholders |
| Phase 2 | development Supabase project or local Supabase | Never use production data; choose production region later with Vercel proximity |
| Phase 5 | development Anthropic key | Server only; set model through validated server configuration |
| Phase 6 | development Vapi org, EN/UR assistants, signing/HMAC credentials | Separate from production; no long-lived browser key; recording off |
| Phase 7 | verified official WhatsApp number | Click-to-chat needs no Cloud key; Cloud and Meta remain disabled |
| Phase 9 | Vercel Pro, production Supabase, production Anthropic/Vapi | Separate secrets/assistant IDs; configure only after GO evidence |

Never paste a secret into Claude chat, commit history, `.continuum/`, screenshots, issue text, test fixtures, or logs. Rotate any credential exposed accidentally.

## 10. Expected command contract after scaffolding

Step 4–6 should establish stable npm scripts. Require these names or document justified equivalents:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run validate:data
npm run test
npm run test:integration
npm run test:contract
npm run test:e2e
npm run test:a11y
npm run eval:agent
npm run build
```

Commands that require local Supabase, Vapi, or browser services must fail with a clear prerequisite—not silently skip. CI distinguishes hermetic unit/contract tests from credentialed staging tests.

## 11. Checkpoint convention

Use small conventional commits after review, for example:

```text
docs: record Cladium architecture decisions
chore: scaffold strict Next.js foundation
feat(db): add versioned menu and business schema
feat(auth): enforce staff roles and RLS
feat(menu): add bilingual accessible menu browsing
feat(takeaway): add idempotent request submission
feat(agent): add grounded concierge tools and evals
feat(voice): add secured bilingual Vapi web concierge
test: add release security and accessibility gates
```

Do not commit known failing tests, real secrets, production database dumps, raw conversation/audio data, or generated deployment state.

## 12. Token and credit strategy without reducing quality

- Use the compact `.continuum/` state at session start and task routing instead of replaying history.
- Keep a single runbook step active; ask for concise diff/test evidence.
- Use local validation scripts for the menu and schemas rather than sending large JSON to the model.
- Start a fresh session at phase boundaries after writing the handoff.
- Use a capable coding model for implementation/tests and reserve the strongest reasoning model for architecture, security, agent policy, difficult debugging, and formal release review.
- Switch models only at a phase boundary when possible; switching mid-conversation can lose prompt-cache reuse.
- Do not spend tokens generating placeholder copy, fake assets, speculative integrations, or explanations already captured in ADRs.
- For the customer-facing concierge, quality is protected through strict tools, deterministic data, critical evals, and bilingual real-speaker testing—not by putting the full knowledge base in every prompt.

The inaccessible external CONTINUUM repository is not installed. If it becomes available, review it before connecting automation; do not add an unreviewed MCP server or session hook merely to reduce tokens.

## 13. Human approvals Claude cannot supply

Before the relevant feature becomes public, obtain and record:

- owner approval of the transcribed menu and published Urdu;
- transparent/vector logo and rights-approved venue/food media;
- primary phone, staff identities/roles, MFA owner, and response procedures;
- tax/service-charge and collection-payment rules;
- takeaway, cancellation, table/treehouse, and event operations;
- privacy, retention/deletion, consent, and legal wording;
- English/Urdu Vapi quality acceptance from real speakers;
- business-owned Vercel, Supabase, domain, Meta, and WhatsApp access.

Missing owner data never authorizes Claude to invent a value. Continue safe scaffolding with the feature disabled.

## 14. Staging and production discipline

Preview/staging must use isolated database, storage, Vapi assistants, Anthropic key, webhooks, and flags. Never point a pull-request deployment at production.

At Step 45 Claude produces a go/no-go report only. Step 46 is allowed only after explicit human GO and requires:

1. tested commit and immutable migration/menu/assistant versions;
2. guarded production migrations;
3. Vercel production deployment;
4. domain/TLS/security-header/region/pooler/secret/flag verification;
5. production smoke tests that do not create fake customer operations;
6. active rollback, error, outbox, abuse, latency, and cost monitoring.

If any stop condition occurs, roll back the application, preserve evidence, and avoid destructive database reversal unless the migration plan explicitly supports it.

## 15. Ready-to-build checklist

- [ ] Research pack committed/backed up privately.
- [ ] Node, npm, Git, and Claude Code verified.
- [ ] `claude doctor` passes.
- [ ] `/status`, `/memory`, and `/permissions` show expected project configuration.
- [ ] Claude opens in Plan mode for the kickoff.
- [ ] Version 2 master prompt reviewed with no scope expansion.
- [ ] Step 1 evidence accepted.
- [ ] Each following step will be authorized individually.
- [ ] No production secret/account is used during early phases.
- [ ] Owner blockers are tracked, not fabricated.

When these are satisfied, approve Runbook Step 2. Application scaffolding begins only at Step 4.
