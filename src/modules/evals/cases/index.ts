/**
 * Eval suite aggregator — Runbook Step 29.
 *
 * `EVAL_SUITE_VERSION` is bumped whenever a case is added, removed, or its
 * assertions/scripted turns change meaningfully — `tests/unit/evals.test.ts`
 * and any future reporting surface record it alongside the report so a
 * historical run can always be tied to the exact suite that produced it.
 */

import type { EvalCase } from '../types';
import { AMBIGUITY_CASES } from './ambiguity';
import { AVAILABILITY_CASES } from './availability';
import { CONFIRMATION_CASES } from './confirmation';
import { ENGLISH_CASES } from './english';
import { HANDOFF_CASES } from './handoff';
import { INJECTION_CASES } from './injection';
import { POLICIES_CASES } from './policies';
import { PRICES_CASES } from './prices';
import { ROMAN_URDU_CASES } from './roman-urdu';
import { TOOL_SELECTION_CASES } from './tool-selection';
import { URDU_SCRIPT_CASES } from './urdu-script';

export const EVAL_SUITE_VERSION = '2026-08-28.1';

export const ALL_EVAL_CASES: readonly EvalCase[] = [
  ...ENGLISH_CASES,
  ...URDU_SCRIPT_CASES,
  ...ROMAN_URDU_CASES,
  ...AMBIGUITY_CASES,
  ...INJECTION_CASES,
  ...PRICES_CASES,
  ...POLICIES_CASES,
  ...AVAILABILITY_CASES,
  ...CONFIRMATION_CASES,
  ...HANDOFF_CASES,
  ...TOOL_SELECTION_CASES,
];
