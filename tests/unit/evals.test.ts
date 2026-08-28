/**
 * CI gate for the agent evaluation suite — Runbook Step 29.
 *
 * Fails the build on any critical, runnable eval regression (the runbook's
 * evidence bullet). A `requiresLiveModel: true` case is never faked here —
 * it stays visibly `skipped`, and skipped cases are explicitly excluded
 * from the pass/fail gate (`eval-policy.md` documents the review process
 * for the non-critical, non-skipped threshold).
 */

import { describe, expect, it } from 'vitest';
import { ALL_EVAL_CASES, EVAL_SUITE_VERSION } from '../../src/modules/evals/cases/index';
import { runEvalSuite } from '../../src/modules/evals/runner';
import type { EvalCategory } from '../../src/modules/evals/types';

const ALL_CATEGORIES: readonly EvalCategory[] = [
  'ENGLISH',
  'URDU_SCRIPT',
  'ROMAN_URDU',
  'AMBIGUITY',
  'INJECTION',
  'PRICES',
  'POLICIES',
  'AVAILABILITY',
  'CONFIRMATION',
  'HANDOFF',
  'TOOL_SELECTION',
];

describe('eval suite data integrity', () => {
  it('every case id is unique', () => {
    const ids = ALL_EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every one of the 11 runbook-named categories has at least one case', () => {
    const present = new Set(ALL_EVAL_CASES.map((c) => c.category));
    for (const category of ALL_CATEGORIES) {
      expect(present.has(category)).toBe(true);
    }
  });

  it('every requiresLiveModel: false case has at least one scripted turn', () => {
    for (const evalCase of ALL_EVAL_CASES) {
      if (!evalCase.requiresLiveModel) {
        expect((evalCase.scriptedTurns ?? []).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('eval suite run (Runbook Step 29 evidence gate)', () => {
  it('has zero critical failures among the cases that actually ran', async () => {
    const report = await runEvalSuite(ALL_EVAL_CASES, EVAL_SUITE_VERSION);

    const criticalFailures = report.results.filter((r) => r.critical && !r.skipped && !r.pass);
    if (criticalFailures.length > 0) {
      const detail = criticalFailures.map((r) => `${r.id}: ${r.failures.join('; ')}`).join('\n');
      throw new Error(`Critical eval case(s) failed:\n${detail}`);
    }

    expect(report.totals.criticalFailed).toBe(0);
    // Sanity: every case is accounted for exactly once (ran + skipped == total).
    expect(report.totals.ran + report.totals.skipped).toBe(report.totals.total);
    expect(report.totals.total).toBe(ALL_EVAL_CASES.length);
  });

  it('skips every requiresLiveModel case with a clear reason, never silently', async () => {
    const report = await runEvalSuite(ALL_EVAL_CASES, EVAL_SUITE_VERSION);
    const liveCaseIds = new Set(ALL_EVAL_CASES.filter((c) => c.requiresLiveModel).map((c) => c.id));

    for (const result of report.results) {
      if (liveCaseIds.has(result.id)) {
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toBeTruthy();
      } else {
        expect(result.skipped).toBe(false);
      }
    }
  });
});
