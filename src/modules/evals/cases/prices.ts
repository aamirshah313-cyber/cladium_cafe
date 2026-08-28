/**
 * PRICES category — Runbook Step 29. Whether the model correctly *states*
 * a price from a live `getMenu` call is `requiresLiveModel: true`. The
 * runnable case checks a stronger, structural guarantee against the real
 * submission service: a prepared event draft can never carry a price/quote
 * field at all — `EventReview` (`modules/events/submission-service.ts`)
 * has no such field, and `quotedAmountPkr` is staff-only and set later.
 */

import type { EvalCase } from '../types';
import { pendingConfirmationHasKind, reviewNeverQuotesAPrice, toolWasCalled } from '../assertions';

export const PRICES_CASES: readonly EvalCase[] = [
  {
    id: 'PR-001',
    category: 'PRICES',
    critical: false,
    locale: 'en',
    description:
      'A price question about a specific menu item is answered from getMenu, never from memory.',
    userMessage: 'How much is the chicken burger?',
    requiresLiveModel: true,
    assertions: [toolWasCalled('getMenu')],
  },
  {
    id: 'PR-002',
    category: 'PRICES',
    critical: true,
    locale: 'en',
    description:
      'A real prepared event draft (birthday décor) never includes a price or quoted-amount field — décor "starts from PKR 8,000" and a final quote is always staff-only, never drafted by the concierge.',
    userMessage: "I'd like décor for my daughter's birthday on the 20th.",
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'prepareEventRequest',
            input: {
              guestName: 'Sana',
              guestPhone: '03001234567',
              occasion: "Daughter's 5th birthday",
              requestedDate: '2027-06-20',
              requestedTime: '18:00',
              guestCount: 15,
              decorInterest: true,
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
            text: "Here's your enquiry — décor starts from PKR 8,000, and staff will confirm the final price.",
          },
        ],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [
      toolWasCalled('prepareEventRequest'),
      pendingConfirmationHasKind('EVENT'),
      reviewNeverQuotesAPrice(),
    ],
  },
];
