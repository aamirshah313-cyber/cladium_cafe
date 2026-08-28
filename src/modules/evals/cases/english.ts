/**
 * ENGLISH category — Runbook Step 29. English is the concierge's baseline
 * language; the genuinely interesting question ("did the model understand
 * and answer correctly") is `requiresLiveModel: true` by nature. The one
 * runnable case here is a structural smoke check only — real tool dispatch
 * for an English-locale turn, not a language-understanding check.
 */

import type { EvalCase } from '../types';
import { escalates, noPendingConfirmation, toolWasCalled } from '../assertions';

export const ENGLISH_CASES: readonly EvalCase[] = [
  {
    id: 'EN-001',
    category: 'ENGLISH',
    critical: false,
    locale: 'en',
    description:
      'A plain English hours question is answered from the getVenueInfo tool, not memory.',
    userMessage: 'What time do you open today?',
    requiresLiveModel: true,
    assertions: [toolWasCalled('getVenueInfo'), escalates(false)],
  },
  {
    id: 'EN-002',
    category: 'ENGLISH',
    critical: false,
    locale: 'en',
    description:
      'Structural smoke check: an English-locale turn that calls a real tool completes cleanly.',
    userMessage: 'Are you open right now?',
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [
          { type: 'tool_use', id: 'call_1', name: 'getVenueInfo', input: { topic: 'HOURS' } },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [{ type: 'text', text: "We're open 12 pm to 12 am — come on by!" }],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [toolWasCalled('getVenueInfo'), escalates(false), noPendingConfirmation()],
  },
  {
    id: 'EN-003',
    category: 'ENGLISH',
    critical: false,
    locale: 'en',
    description:
      'An English menu question about a specific dietary need is answered from getMenu, not invented.',
    userMessage: 'Do you have anything vegetarian?',
    requiresLiveModel: true,
    assertions: [toolWasCalled('getMenu'), escalates(false)],
  },
];
