import { describe, expect, it } from 'vitest';
import { CONCIERGE_SYSTEM_POLICY } from '../../src/modules/concierge/policy';
import { resolveLocalizedText } from '../../src/lib/i18n/localized-text';
import {
  BIRTHDAY_POLICY_TEXT,
  CAKE_POLICY_TEXT,
  DELIVERY_POLICY_TEXT,
  OUTSIDE_FOOD_POLICY_TEXT,
  SEATING_POLICY_TEXT,
  WHATSAPP_DISPLAY,
} from '../../src/modules/business/facts';

/**
 * Every non-negotiable fact must appear verbatim — derived from the SAME
 * approved constants the guest-facing pages read, never a hardcoded
 * duplicate string that could quietly drift from `business/facts.ts`.
 */
describe('CONCIERGE_SYSTEM_POLICY — non-negotiable facts present', () => {
  it('states the hours', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toContain('12 pm to 12 am');
  });

  it('states takeaway/no-delivery', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toContain(resolveLocalizedText(DELIVERY_POLICY_TEXT, 'en'));
  });

  it('states the seating policy', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toContain(resolveLocalizedText(SEATING_POLICY_TEXT, 'en'));
  });

  it('states the birthday/décor policy', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toContain(resolveLocalizedText(BIRTHDAY_POLICY_TEXT, 'en'));
  });

  it('states the cake policy', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toContain(resolveLocalizedText(CAKE_POLICY_TEXT, 'en'));
  });

  it('states the outside-food policy', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toContain(resolveLocalizedText(OUTSIDE_FOOD_POLICY_TEXT, 'en'));
  });

  it('gives the official WhatsApp number for handoff', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toContain(WHATSAPP_DISPLAY);
  });
});

describe('CONCIERGE_SYSTEM_POLICY — behavioral guardrails', () => {
  it('instructs the model to use tools for facts, never memory', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toMatch(
      /call getMenu, getVenueInfo, viewCart, or getRequestStatus/,
    );
    expect(CONCIERGE_SYSTEM_POLICY).toMatch(/never state a price.*from memory/i);
  });

  it('instructs the model to never confirm/promise an instant outcome', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toMatch(/never confirm, promise, or imply/i);
    expect(CONCIERGE_SYSTEM_POLICY).toContain('REQUESTED');
  });

  it('instructs bilingual conduct without inventing Urdu translations', () => {
    expect(CONCIERGE_SYSTEM_POLICY).toMatch(/english or urdu/i);
    expect(CONCIERGE_SYSTEM_POLICY).toMatch(/roman urdu/i);
    expect(CONCIERGE_SYSTEM_POLICY).toMatch(/rather than inventing a translation/i);
  });
});

describe('CONCIERGE_SYSTEM_POLICY — compact', () => {
  it('stays compact — well under a full-menu-sized prompt', () => {
    expect(CONCIERGE_SYSTEM_POLICY.length).toBeLessThan(2000);
  });
});
