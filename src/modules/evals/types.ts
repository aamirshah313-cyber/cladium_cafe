/**
 * Agent evaluation suite types — Runbook Step 29 ("Convert and expand
 * acceptance tests into an automated versioned evaluation suite").
 *
 * An `EvalCase` is deliberately not always executable in this sandbox:
 * `requiresLiveModel: true` marks a case whose scoring depends on an
 * actual Anthropic response (does the model correctly interpret Roman
 * Urdu phrasing, pick the right tool from an ambiguous request, resist an
 * injection attempt in its own generated text) — none of which can be
 * exercised without a live `ANTHROPIC_API_KEY`, absent from this sandbox
 * (D-031). Those cases are still fully specified, versioned, and counted
 * — just skipped, visibly, rather than faked. `requiresLiveModel: false`
 * cases are scored by running the real `orchestrateTurn` (never a
 * reimplementation) against a *scripted* fake `ChatClient` whose tool
 * calls and final text are fixed by the case itself — these test
 * deterministic guarantees (system-prompt immutability, tool-dispatch
 * validation, `pendingConfirmation` surfacing, escalation/backoff,
 * approved-fact exactness) that do not depend on model judgment at all.
 */

import type { Locale } from '../../lib/i18n/locale';
import type { SendMessageResult } from '../integrations/anthropic-client';

export type EvalCategory =
  | 'ENGLISH'
  | 'URDU_SCRIPT'
  | 'ROMAN_URDU'
  | 'AMBIGUITY'
  | 'INJECTION'
  | 'PRICES'
  | 'POLICIES'
  | 'AVAILABILITY'
  | 'CONFIRMATION'
  | 'HANDOFF'
  | 'TOOL_SELECTION';

export interface EvalTranscript {
  readonly reply: string;
  readonly escalate: boolean;
  readonly pendingConfirmation?:
    { readonly kind: 'BOOKING' | 'EVENT'; readonly review: unknown } | undefined;
  /** Every `system` value the fake chat client was called with, in order — for injection/policy-immutability assertions. */
  readonly systemPromptsSeen: readonly string[];
  /** Every tool name the fake chat client's scripted responses caused to be dispatched, in order. */
  readonly toolCallsSeen: readonly string[];
}

export type EvalAssertion = (transcript: EvalTranscript) => {
  readonly pass: boolean;
  readonly reason: string;
};

export interface EvalCase {
  readonly id: string;
  readonly category: EvalCategory;
  /** A failing critical case fails the whole suite (`tests/unit/evals.test.ts`). A failing non-critical case is reported, not blocking — see `cladium-research/agent/eval-policy.md`. */
  readonly critical: boolean;
  readonly locale: Locale;
  readonly description: string;
  readonly userMessage: string;
  readonly requiresLiveModel: boolean;
  /**
   * Scripted fake-model turns, consumed in order by call index — only
   * meaningful when `requiresLiveModel` is `false`. The last entry should
   * have `stopReason: 'end_turn'` so the orchestrator's loop terminates.
   */
  readonly scriptedTurns?: readonly SendMessageResult[];
  readonly assertions: readonly EvalAssertion[];
}

export interface EvalCaseResult {
  readonly id: string;
  readonly category: EvalCategory;
  readonly critical: boolean;
  readonly skipped: boolean;
  readonly skipReason?: string;
  readonly pass: boolean;
  readonly failures: readonly string[];
}

export interface EvalReport {
  readonly suiteVersion: string;
  readonly results: readonly EvalCaseResult[];
  readonly totals: {
    readonly total: number;
    readonly skipped: number;
    readonly ran: number;
    readonly passed: number;
    readonly failed: number;
    readonly criticalFailed: number;
  };
}
