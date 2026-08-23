# Cladium build start here

The planning pack is ready for a controlled Claude Code build. Application source code has **not** been started.

## Authoritative entry points

1. `CLAUDE.md` — repository-wide non-negotiable instructions.
2. `.continuum/PROJECT_STATE.md` and `.continuum/TASKS.md` — compact resume context.
3. `cladium-research/architecture/context-routing-v2.md` — task-specific source selector.
4. `cladium-research/claude/MASTER_BUILD_PROMPT_V2.md` — first prompt for Claude Code.
5. `cladium-research/claude/CLADIUM_CODE_BUILD_RUNBOOK_V2.md` — one-step-at-a-time execution sequence.
6. `cladium-research/claude/CLAUDE_CODE_EXECUTION_GUIDE.md` — Windows setup, permissions, commands, accounts, checkpoints, and phase operations.
7. `cladium-research/architecture/production-architecture-v2.md` — product/system architecture.
8. `cladium-research/architecture/data-model-v2.md` — schema, state machines, and transaction contracts.
9. `cladium-research/operations/release-gates-v2.md` — mandatory production evidence.

Do not start from the non-V2 master prompt or runbook; those files are preserved only as historical references.

## Exact Claude Code process

1. Back up this folder or commit the research pack to a private Git repository.
2. Open this folder as the Claude Code working directory.
3. Confirm Claude has discovered root `CLAUDE.md` and loaded the compact `.continuum/` state—not the entire research pack.
4. Paste the contents of `MASTER_BUILD_PROMPT_V2.md`.
5. Claude must return its proposed repository tree, database/RLS sequence, environment inventory, test plan, blockers, and first proposed runbook step **without writing app code**.
6. Review that answer against the Version 2 architecture. Correct any invented facts or widened scope.
7. Give approval for runbook Step 1 only.
8. After each step, review changed files and verification results before approving the next step.
9. At phase boundaries update `.continuum/PROJECT_STATE.md`, `TASKS.md`, and any durable decision; then use `/context`. Use `/compact` only at a phase boundary.
10. Stop at Step 45 for the formal go/no-go review. Production deployment in Step 46 requires explicit approval and evidence for every applicable release gate.

## Safe work that can begin before owner signoff

- repository/app scaffolding;
- validation tooling and menu importer tests;
- local Supabase migrations and RLS tests;
- design tokens, bilingual routing, RTL, theme, and accessible shell;
- deterministic draft/request services using development/staging data;
- automated policy and security tests.

## Production blockers already known

- owner signoff on the transcribed menu and publishable Urdu;
- transparent/vector logo and a sufficiently rich rights-approved photo library;
- primary public phone-number decision and staff workflow/roles;
- exact tax/service-charge and payment-at-collection rules;
- table/treehouse/event operational rules;
- owner-approved privacy, retention/deletion, consent, and legal wording;
- real-speaker English/Urdu Vapi quality bake-off;
- business-owned Meta/WhatsApp configuration if those flagged integrations are later enabled.

Do not compensate for a blocker with fabricated content. Keep the feature disabled or use a truthful canonical fallback.

## Token-credit discipline

- Resume from `.continuum/PROJECT_STATE.md`; do not re-explain the project in each session.
- Use `architecture/context-routing-v2.md` to read only the active domain sources.
- Keep a single active runbook step and return compact verification summaries instead of raw logs.
- Never paste the full menu or long runbook into a conversation; query files and run validation tools locally.
- The supplied external CONTINUUM repository was inaccessible during preparation. The local dependency-free layer can be upgraded after the exact code is attached or made accessible and passes review.
