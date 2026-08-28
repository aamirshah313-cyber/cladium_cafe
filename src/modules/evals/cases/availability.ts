/**
 * AVAILABILITY category — Runbook Step 29. "A requested time is not
 * availability" (`data-model-v2.md` §5) — nothing in this codebase checks
 * or promises availability except a later staff `CONFIRMED` transition.
 * Whether the model correctly phrases that in its own live reply is
 * `requiresLiveModel: true`. The runnable case checks the real, governing
 * instruction line in the actual system prompt.
 */

import type { EvalCase } from '../types';
import { escalates, systemPromptContains } from '../assertions';

export const AVAILABILITY_CASES: readonly EvalCase[] = [
  {
    id: 'AV-001',
    category: 'AVAILABILITY',
    critical: false,
    locale: 'en',
    description:
      'Asking whether a table is available tonight must produce a request-only answer, never a confirmed-availability claim.',
    userMessage: 'Is a table available tonight at 8pm?',
    requiresLiveModel: true,
    assertions: [escalates(false)],
  },
  {
    id: 'AV-002',
    category: 'AVAILABILITY',
    critical: true,
    locale: 'en',
    description:
      'The real system prompt explicitly forbids confirming, promising, or implying availability — the exact instruction line, verbatim.',
    userMessage: 'hi',
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [{ type: 'text', text: 'Hi! How can I help today?' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 5 },
      },
    ],
    assertions: [
      systemPromptContains(
        'Never confirm, promise, or imply an instant order, booking, availability, payment, or staff decision.',
      ),
    ],
  },
];
