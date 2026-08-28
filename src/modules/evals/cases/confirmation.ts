/**
 * CONFIRMATION category — Runbook Step 29. These cases run the real
 * `orchestrateTurn` and real `prepareBookingRequest`/`prepareEventRequest`
 * tools (Step 28's confirmation-token machinery, Step 19's submission
 * service) — fully deterministic, no model judgment involved, so every
 * case here is `requiresLiveModel: false` and `critical: true`.
 */

import type { EvalCase } from '../types';
import { noPendingConfirmation, pendingConfirmationHasKind, toolWasCalled } from '../assertions';

export const CONFIRMATION_CASES: readonly EvalCase[] = [
  {
    id: 'CF-001',
    category: 'CONFIRMATION',
    critical: true,
    locale: 'en',
    description:
      'A complete, valid booking draft surfaces as a real pendingConfirmation — the same review+token machinery the manual /book form uses.',
    userMessage: 'Table for 4, Friday 7pm, general seating, name Ahmed, phone 03001234567.',
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
              seatingPreference: 'GENERAL',
            },
          },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [
          { type: 'text', text: "Here's your booking request — please confirm to submit it." },
        ],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [toolWasCalled('prepareBookingRequest'), pendingConfirmationHasKind('BOOKING')],
  },
  {
    id: 'CF-002',
    category: 'CONFIRMATION',
    critical: true,
    locale: 'en',
    description:
      'When a single turn calls both prepareBookingRequest and prepareEventRequest, only the latest prepare call in the turn is kept as pendingConfirmation.',
    userMessage: 'Actually, let me also ask about a birthday event instead.',
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
              seatingPreference: 'GENERAL',
            },
          },
          {
            type: 'tool_use',
            id: 'call_2',
            name: 'prepareEventRequest',
            input: {
              guestName: 'Ahmed',
              guestPhone: '03001234567',
              occasion: 'Birthday',
              requestedDate: '2027-06-18',
              requestedTime: '19:00',
              guestCount: 10,
              decorInterest: true,
            },
          },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [
          { type: 'text', text: "Here's your event enquiry — please confirm to submit it." },
        ],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [
      toolWasCalled('prepareBookingRequest'),
      toolWasCalled('prepareEventRequest'),
      pendingConfirmationHasKind('EVENT'),
    ],
  },
  {
    id: 'CF-003',
    category: 'CONFIRMATION',
    critical: true,
    locale: 'en',
    description:
      'An event draft missing every required field is rejected by real schema validation before it can ever become a pendingConfirmation.',
    userMessage: "Sign me up for décor, I'll send details later.",
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'prepareEventRequest',
            input: { guestName: 'Ahmed' },
          },
        ],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: [
          { type: 'text', text: 'I still need a few more details before I can draft that.' },
        ],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [toolWasCalled('prepareEventRequest'), noPendingConfirmation()],
  },
];
