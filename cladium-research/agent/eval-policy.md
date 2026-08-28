# Concierge agent evaluation policy

Status: **living document** — updated whenever the eval suite (`src/modules/evals/`) changes materially.

## What the suite is

`src/modules/evals/cases/` holds a versioned set of `EvalCase` entries across
the 11 categories the runbook names: English, Urdu script, Roman Urdu,
ambiguity, injection, prices, policies, availability, confirmation, handoff,
and tool selection. `src/modules/evals/runner.ts#runEvalSuite` runs the suite
against the real `orchestrateTurn` (never a reimplementation of it) and
`tests/unit/evals.test.ts` gates CI on the result. `EVAL_SUITE_VERSION`
(`cases/index.ts`) is bumped whenever a case is added, removed, or its
assertions/scripted turns change meaningfully, so a historical report can
always be tied to the exact suite that produced it.

## `requiresLiveModel`

Every case declares `requiresLiveModel: boolean`:

- **`false`** — the case is scored deterministically, right now, in this
  sandbox and in CI: a scripted fake `ChatClient` drives the real
  orchestrator loop, real tool dispatch, and (for `prepareBookingRequest`/
  `prepareEventRequest`) the real Step 19 submission service. These cases
  test orchestrator-level and policy-level *guarantees* — the system prompt
  never changes, no submit tool is ever registered, a malformed draft never
  becomes a confirmation, the tool-call budget really is enforced, a prepared
  event review really has no price field — none of which depend on model
  judgment at all.
- **`true`** — the case depends on an actual Anthropic model response
  (bilingual comprehension, picking the right tool from an ambiguous
  request, resisting a live adversarial prompt in the model's own generated
  text). No `ANTHROPIC_API_KEY` is available in this sandbox (D-031), so
  these cases are fully specified, versioned, and counted by the suite, but
  `runEvalCase` visibly marks them `skipped` with a reason — never faked,
  never silently counted as passing, never silently dropped from the suite.

## Pass/fail gate (CI)

`tests/unit/evals.test.ts` runs on every CI build and fails it if:

- any **critical** case that actually ran (`skipped: false`) does not pass, or
- the suite's own data integrity checks fail (duplicate case ids, a category
  with zero cases, a `requiresLiveModel: false` case with no scripted turns).

A case is `critical: true` when its failure would mean one of `CLAUDE.md`'s
non-negotiable rules could be violated in production — inventing a price,
confirming availability, exposing a submit path to the model, leaking the
system prompt, or the escalation/handoff path failing to trigger. All
`requiresLiveModel: false` cases in the current suite are `critical: true`
for exactly this reason: they encode structural guarantees, not
nice-to-haves.

A `critical: false` case failing does **not** block CI. Every
`requiresLiveModel: true` case in the current suite is `critical: false`,
because it cannot run here at all — marking a *skipped* case critical would
make the gate meaningless (nothing to pass or fail). This is the suite's own
non-critical threshold: **zero tolerance for a runnable critical failure,
no gate at all on a case that cannot run in this environment.**

## Review process

1. **Adding a case**: extend the relevant file under `src/modules/evals/cases/`,
   reuse an existing assertion from `assertions.ts` where possible, bump
   `EVAL_SUITE_VERSION`, and re-run `tests/unit/evals.test.ts`.
2. **A non-critical (live-model) case fails or needs judgment once a real
   `ANTHROPIC_API_KEY` exists**: this is a product/prompt-quality review, not
   a merge blocker. Track it in `.continuum/TASKS.md` until `policy.ts` or
   the tool descriptions are adjusted and the case is re-run.
3. **A critical case starts failing**: this blocks the PR. Fix the
   regression in the orchestrator/tool-registry/submission-service — never
   loosen or delete the assertion to make CI pass.
4. **Before production launch**: `release-gates-v2.md` Gate 5 requires
   "critical policy evals pass 100% in English, Urdu script, and Roman
   Urdu." That gate can only be evidenced once a live `ANTHROPIC_API_KEY` is
   available and every `requiresLiveModel: true` case in this suite has
   actually been run (not skipped) and passed — tracked as an open item in
   `.continuum/TASKS.md` until then. This document's CI gate (above) is a
   necessary but not sufficient condition for that launch gate.
