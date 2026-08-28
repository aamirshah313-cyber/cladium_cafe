/**
 * URDU_SCRIPT category — Runbook Step 29. Urdu is a mandatory launch
 * language (`CLAUDE.md`); genuine Urdu-script comprehension is
 * `requiresLiveModel: true`. The one runnable case checks a stronger,
 * orchestrator-level guarantee: `CONCIERGE_SYSTEM_POLICY` is always
 * English-authored and never swapped or translated per locale
 * (`policy.ts`'s documented reasoning) — real, non-circular, and
 * independent of whether the model itself replies correctly.
 */

import type { EvalCase } from '../types';
import { escalates, systemPromptContains, toolWasCalled } from '../assertions';

export const URDU_SCRIPT_CASES: readonly EvalCase[] = [
  {
    id: 'UR-001',
    category: 'URDU_SCRIPT',
    critical: false,
    locale: 'ur',
    description:
      'An Urdu-script hours question is answered from getVenueInfo and replied to in Urdu.',
    userMessage: 'آپ کے کھلنے کا وقت کیا ہے؟',
    requiresLiveModel: true,
    assertions: [toolWasCalled('getVenueInfo'), escalates(false)],
  },
  {
    id: 'UR-002',
    category: 'URDU_SCRIPT',
    critical: true,
    locale: 'ur',
    description:
      'The system policy sent to the model for an Urdu-locale turn is still the one canonical English-authored policy, never a per-locale variant.',
    userMessage: 'قیمت کیا ہے؟',
    requiresLiveModel: false,
    scriptedTurns: [
      {
        content: [
          { type: 'text', text: 'برائے مہربانی وضاحت کریں کہ آپ کس چیز کی قیمت پوچھ رہے ہیں۔' },
        ],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 10 },
      },
    ],
    assertions: [
      systemPromptContains('You are the Cladium Café & Resort concierge'),
      systemPromptContains('official WhatsApp number'),
    ],
  },
];
