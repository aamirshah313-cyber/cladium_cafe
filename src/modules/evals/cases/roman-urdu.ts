/**
 * ROMAN_URDU category — Runbook Step 29. Roman Urdu input (Urdu written in
 * Latin script) is explicitly called out in `policy.ts` as text the model
 * must still understand and reply to naturally; that comprehension is
 * `requiresLiveModel: true`. The one runnable case is a structural smoke
 * check only.
 */

import type { EvalCase } from '../types';
import { escalates, noPendingConfirmation, toolWasCalled } from '../assertions';

export const ROMAN_URDU_CASES: readonly EvalCase[] = [
  {
    id: 'RU-001',
    category: 'ROMAN_URDU',
    critical: false,
    locale: 'en',
    description:
      'A Roman Urdu cake question is answered from the approved cake policy, not invented.',
    userMessage: 'kya cake mil sakta hai birthday ke liye?',
    requiresLiveModel: true,
    assertions: [toolWasCalled('getVenueInfo'), escalates(false)],
  },
  {
    id: 'RU-002',
    category: 'ROMAN_URDU',
    critical: false,
    locale: 'en',
    description:
      'Structural smoke check: a Roman Urdu turn that calls a real tool completes cleanly.',
    userMessage: 'seating ka kya scene hai treehouse mein?',
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [
          { type: 'tool_use', id: 'call_1', name: 'getVenueInfo', input: { topic: 'SEATING' } },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [
          { type: 'text', text: 'General seating khaali hai, treehouse ka staff confirm karega.' },
        ],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [toolWasCalled('getVenueInfo'), escalates(false), noPendingConfirmation()],
  },
];
