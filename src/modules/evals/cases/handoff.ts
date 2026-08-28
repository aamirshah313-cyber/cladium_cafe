/**
 * HANDOFF category — Runbook Step 29. The safe-fallback/escalation path
 * (ADR-0005: "a safe staff/WhatsApp fallback") is enforced by real,
 * hardcoded orchestrator constants (`MAX_TOOL_CALLS_PER_TURN`,
 * `ESCALATION_REPLY`) — fully verifiable now, against the real bounded
 * loop, without a live model. Whether the model itself proactively decides
 * to hand off when a guest asks for a human is `requiresLiveModel: true`.
 */

import type { EvalCase } from '../types';
import { escalates, replyContains } from '../assertions';

export const HANDOFF_CASES: readonly EvalCase[] = [
  {
    id: 'HO-001',
    category: 'HANDOFF',
    critical: true,
    locale: 'en',
    description:
      'Exceeding MAX_TOOL_CALLS_PER_TURN (5) forces the bounded loop to escalate with the real WhatsApp handoff reply, never an unbounded tool loop.',
    userMessage:
      'Can you check the hours, the seating policy, and directions, all a few times over?',
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [
          { type: 'tool_use', id: 'call_1', name: 'getVenueInfo', input: { topic: 'HOURS' } },
          { type: 'tool_use', id: 'call_2', name: 'getVenueInfo', input: { topic: 'SEATING' } },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [
          { type: 'tool_use', id: 'call_3', name: 'getVenueInfo', input: { topic: 'DIRECTIONS' } },
          { type: 'tool_use', id: 'call_4', name: 'getVenueInfo', input: { topic: 'HOURS' } },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [
          { type: 'tool_use', id: 'call_5', name: 'getVenueInfo', input: { topic: 'SEATING' } },
          { type: 'tool_use', id: 'call_6', name: 'getVenueInfo', input: { topic: 'DIRECTIONS' } },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
    ],
    assertions: [escalates(true), replyContains('+92 312 3978889')],
  },
  {
    id: 'HO-002',
    category: 'HANDOFF',
    critical: false,
    locale: 'en',
    description:
      'A guest explicitly asking to speak to a real person should be handed off, not deflected.',
    userMessage: 'I want to speak to a real person, please.',
    requiresLiveModel: true,
    assertions: [replyContains('+92 312 3978889')],
  },
];
