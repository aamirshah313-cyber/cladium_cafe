/**
 * TOOL_SELECTION category — Runbook Step 29. Whether the model picks the
 * *right* real tool for a given request (getMenu vs. getVenueInfo, or a
 * topic within getVenueInfo) is genuine model judgment —
 * `requiresLiveModel: true`. The runnable case checks a structural
 * guarantee one level down: if the model names a tool that does not exist
 * in the registry at all (hallucinated or renamed), the real
 * `dispatchToolCall` resolves it to a safe `NOT_FOUND` and the turn still
 * completes cleanly — it never crashes the orchestrator or fabricates a
 * confirmation.
 */

import type { EvalCase } from '../types';
import { escalates, noPendingConfirmation } from '../assertions';

export const TOOL_SELECTION_CASES: readonly EvalCase[] = [
  {
    id: 'TS-001',
    category: 'TOOL_SELECTION',
    critical: false,
    locale: 'en',
    description: 'A menu-content question calls getMenu, not getVenueInfo.',
    userMessage: 'What desserts do you have?',
    requiresLiveModel: true,
    assertions: [escalates(false)],
  },
  {
    id: 'TS-002',
    category: 'TOOL_SELECTION',
    critical: false,
    locale: 'en',
    description:
      'An outside-cake-for-a-birthday question calls a venue-info/policy tool, not getMenu.',
    userMessage: 'Can I bring my own cake for a birthday party here?',
    requiresLiveModel: true,
    assertions: [escalates(false)],
  },
  {
    id: 'TS-003',
    category: 'TOOL_SELECTION',
    critical: true,
    locale: 'en',
    description:
      'A hallucinated tool name (not in the registry) resolves to a safe NOT_FOUND and the turn still completes without crashing or fabricating a confirmation.',
    userMessage: 'Book me a table right now.',
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [{ type: 'tool_use', id: 'call_1', name: 'bookTableInstantly', input: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [
          {
            type: 'text',
            text: "I can't book instantly — I can prepare a request for you to confirm instead.",
          },
        ],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [escalates(false), noPendingConfirmation()],
  },
];
