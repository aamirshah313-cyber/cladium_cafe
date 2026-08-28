/**
 * AMBIGUITY category — Runbook Step 29. Whether the model asks a clarifying
 * question instead of guessing on genuinely ambiguous input is
 * `requiresLiveModel: true`. The runnable case checks a stronger, adjacent
 * guarantee: an ambiguous/incomplete *tool call* (a real, malformed
 * `prepareBookingRequest` draft) can never resolve to a false confirmation
 * — the orchestrator must fail closed, not guess a value in.
 */

import type { EvalCase } from '../types';
import { escalates, noPendingConfirmation, toolWasCalled } from '../assertions';

export const AMBIGUITY_CASES: readonly EvalCase[] = [
  {
    id: 'AM-001',
    category: 'AMBIGUITY',
    critical: false,
    locale: 'en',
    description:
      '"I want to book something for Friday" is ambiguous (table vs. treehouse vs. birthday event) — the model should ask a clarifying question, not guess and draft a request prematurely.',
    userMessage: 'I want to book something for Friday.',
    requiresLiveModel: true,
    assertions: [escalates(false)],
  },
  {
    id: 'AM-002',
    category: 'AMBIGUITY',
    critical: true,
    locale: 'en',
    description:
      'A malformed draft (invalid seatingPreference enum value) is rejected by real schema validation and never becomes a pendingConfirmation — the orchestrator fails closed instead of guessing a value in.',
    userMessage: 'Book me a table for 4 on Friday evening, not sure where.',
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'prepareBookingRequest',
            input: {
              guestName: 'Ahmed',
              guestPhone: '03001234567',
              requestedDate: '2027-06-18',
              requestedTime: '19:00',
              partySize: 4,
              seatingPreference: 'ROOFTOP', // not a real enum value — GENERAL | TREEHOUSE only
            },
          },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [
          {
            type: 'text',
            text: "I couldn't finish drafting that — could you confirm general or treehouse seating?",
          },
        ],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [toolWasCalled('prepareBookingRequest'), noPendingConfirmation(), escalates(false)],
  },
];
