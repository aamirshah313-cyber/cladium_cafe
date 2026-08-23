# Local Continuum-style context layer

Purpose: reduce repeated context loading and handoff cost across Claude Code and Codex while keeping project decisions inspectable in Git.

The user-supplied repository `https://github.com/AShakeel/CONTINUUM` was not publicly accessible during setup, so no external software or unverified hooks were installed. These dependency-free files implement the safe part of the pattern locally:

- `PROJECT_STATE.md` — compact current briefing;
- `TASKS.md` — active/next/blocked/completed work;
- `DECISIONS.md` — durable rationale, not transient narration;
- `HANDOFF_TEMPLATE.md` — bounded phase/session checkpoint.

## Session protocol

1. Read root `CLAUDE.md`.
2. Read `PROJECT_STATE.md` and `TASKS.md`.
3. Use `cladium-research/architecture/context-routing-v2.md` to load only sources relevant to the active step.
4. Inspect code/search results narrowly; do not preload the repository, full menu, long runbook, or raw logs.
5. At a runbook phase boundary, update state/tasks/decisions once, with evidence and exact next action.

## Authority and security

This layer summarizes; it never overrides root `CLAUDE.md`, verified business data, Version 2 architecture/data model, or release gates. If summary and source disagree, correct the summary from the source.

Keep `.continuum/` source-tracked, but never write API keys, tokens, customer information, raw conversations, audio, private URLs, or production identifiers here.

## Upgrade path for the exact tool

When the requested repository becomes accessible:

1. inspect its license, README, dependencies, install hooks, filesystem/network behavior, secret handling, telemetry, and tests;
2. install only after that review and explicit approval for software installation;
3. map its checkpoint fields to these files instead of duplicating truth;
4. ensure generated memory is bounded, redacted, project-scoped, and lower-authority than the Version 2 sources;
5. test resume accuracy and measure actual context reduction before enabling automatic hooks.
