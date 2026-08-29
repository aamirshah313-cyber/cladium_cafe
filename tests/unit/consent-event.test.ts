import { describe, expect, it } from 'vitest';
import { buildConsentEvent } from '../../src/lib/domain/consent-event';

const NOW = new Date('2026-08-29T12:00:00Z');

describe('buildConsentEvent', () => {
  it('builds a full event with the given clock', () => {
    const event = buildConsentEvent({
      sessionId: 'session-1',
      category: 'MICROPHONE',
      granted: true,
      policyVersion: '2026-08-29.1',
      source: 'voice_panel',
      correlationId: 'corr-1',
      now: () => NOW,
    });
    expect(event).toEqual({
      sessionId: 'session-1',
      category: 'MICROPHONE',
      granted: true,
      policyVersion: '2026-08-29.1',
      source: 'voice_panel',
      proof: {},
      correlationId: 'corr-1',
      occurredAt: NOW.toISOString(),
    });
  });

  it('defaults proof to an empty object when omitted', () => {
    const event = buildConsentEvent({
      sessionId: 'session-1',
      category: 'ESSENTIAL_PREFERENCES',
      granted: true,
      policyVersion: '1',
      source: 'privacy_page',
      correlationId: 'corr-1',
      now: () => NOW,
    });
    expect(event.proof).toEqual({});
  });

  it('carries a supplied proof object through unchanged, and it is never a free-text field', () => {
    const event = buildConsentEvent({
      sessionId: 'session-1',
      category: 'META_MARKETING',
      granted: false,
      policyVersion: '1',
      source: 'privacy_page',
      proof: { bannerVersion: 2 },
      correlationId: 'corr-1',
      now: () => NOW,
    });
    expect(event.proof).toEqual({ bannerVersion: 2 });
  });

  it('defaults to the real clock when now is omitted', () => {
    const before = Date.now();
    const event = buildConsentEvent({
      sessionId: 'session-1',
      category: 'RECORDING',
      granted: false,
      policyVersion: '1',
      source: 'privacy_page',
      correlationId: 'corr-1',
    });
    const after = Date.now();
    const occurredAtMs = new Date(event.occurredAt).getTime();
    expect(occurredAtMs).toBeGreaterThanOrEqual(before);
    expect(occurredAtMs).toBeLessThanOrEqual(after);
  });
});
