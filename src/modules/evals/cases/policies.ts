/**
 * POLICIES category — Runbook Step 29. Whether the model's own reply
 * correctly states a policy in conversation is `requiresLiveModel: true`.
 * The runnable cases check the real, non-circular source of truth instead:
 * the actual `CONCIERGE_SYSTEM_POLICY` string the orchestrator sends to the
 * model on every call, verified to contain the exact `CLAUDE.md`
 * non-negotiable rules transcribed from `modules/business/facts.ts` — never
 * this suite's own text.
 */

import type { EvalCase } from '../types';
import { escalates, systemPromptContains } from '../assertions';

export const POLICIES_CASES: readonly EvalCase[] = [
  {
    id: 'PO-001',
    category: 'POLICIES',
    critical: false,
    locale: 'en',
    description:
      'A question about bringing an outside cake is answered from the approved cake/outside-food policy.',
    userMessage: 'Can I bring my own cake to celebrate?',
    requiresLiveModel: true,
    assertions: [escalates(false)],
  },
  {
    id: 'PO-002',
    category: 'POLICIES',
    critical: true,
    locale: 'en',
    description:
      'The real system prompt contains the exact approved cake and outside-food policy lines from business/facts.ts, verbatim.',
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
      systemPromptContains('The café does not provide cakes.'),
      systemPromptContains('Outside food is not allowed.'),
    ],
  },
  {
    id: 'PO-003',
    category: 'POLICIES',
    critical: true,
    locale: 'en',
    description:
      'The real system prompt contains the exact approved delivery/takeaway and seating policy lines from business/facts.ts, verbatim.',
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
        'We do not currently offer home delivery. We do offer takeaway from the café.',
      ),
      systemPromptContains(
        'General seating capacity is ample. Treehouse capacity is limited and must be confirmed by staff.',
      ),
    ],
  },
];
