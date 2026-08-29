import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  trackMetaEvent,
  type TrackMetaEventDeps,
} from '../../src/modules/integrations/meta-events';
import type { Logger } from '../../src/lib/logging';
import type { MetaEventClient, MetaEventPayload } from '../../src/modules/integrations/meta-client';

const NOW = new Date('2026-08-29T12:00:00Z');

function fakeLogger(): Logger & {
  readonly calls: { level: string; event: string; fields?: Record<string, unknown> }[];
} {
  const calls: { level: string; event: string; fields?: Record<string, unknown> }[] = [];
  const base = {
    calls,
    debug: (event: string, fields?: Record<string, unknown>) =>
      calls.push({ level: 'debug', event, fields }),
    info: (event: string, fields?: Record<string, unknown>) =>
      calls.push({ level: 'info', event, fields }),
    warn: (event: string, fields?: Record<string, unknown>) =>
      calls.push({ level: 'warn', event, fields }),
    error: (event: string, fields?: Record<string, unknown>) =>
      calls.push({ level: 'error', event, fields }),
    logAppError: () => {},
  };
  return { ...base, withCorrelationId: () => fakeLogger() } as unknown as Logger & {
    calls: typeof calls;
  };
}

function fakeClient(
  behavior: 'succeed' | 'reject' | 'hang' = 'succeed',
): MetaEventClient & { readonly calls: MetaEventPayload[] } {
  const calls: MetaEventPayload[] = [];
  return {
    calls,
    async sendEvent(payload) {
      calls.push(payload);
      if (behavior === 'reject') throw new Error('meta api unreachable: token abc123');
      if (behavior === 'hang') return new Promise(() => {}); // never resolves
    },
  };
}

function buildDeps(overrides: Partial<TrackMetaEventDeps> = {}): TrackMetaEventDeps {
  return {
    client: fakeClient(),
    isFeatureEnabled: () => true,
    hasConsent: async () => true,
    logger: fakeLogger(),
    generateEventId: () => 'fixed-event-id',
    now: () => NOW,
    ...overrides,
  };
}

describe('trackMetaEvent — feature flag', () => {
  it('sends nothing and never checks consent when FEATURE_META_MARKETING is off', async () => {
    let consentChecked = false;
    const deps = buildDeps({
      isFeatureEnabled: () => false,
      hasConsent: async () => {
        consentChecked = true;
        return true;
      },
    });
    const result = await trackMetaEvent(deps, { eventName: 'view_menu', sessionId: 'session-1' });
    expect(result).toEqual({ sent: false, eventId: null });
    expect(consentChecked).toBe(false);
  });
});

describe('trackMetaEvent — consent gating ("consent-denied sends nothing")', () => {
  it('sends nothing when META_MARKETING consent is not granted', async () => {
    const client = fakeClient();
    const deps = buildDeps({ client, hasConsent: async () => false });
    const result = await trackMetaEvent(deps, {
      eventName: 'submit_booking_request',
      sessionId: 'session-1',
    });
    expect(result).toEqual({ sent: false, eventId: null });
    expect(client.calls).toHaveLength(0);
  });

  it('sends when consent is granted', async () => {
    const client = fakeClient();
    const deps = buildDeps({ client });
    const result = await trackMetaEvent(deps, {
      eventName: 'add_to_cart',
      sessionId: 'session-1',
      eventSourceUrl: '/en/menu',
    });
    expect(result).toEqual({ sent: true, eventId: 'fixed-event-id' });
    expect(client.calls).toEqual([
      {
        eventName: 'add_to_cart',
        eventId: 'fixed-event-id',
        occurredAt: NOW,
        eventSourceUrl: '/en/menu',
      },
    ]);
  });

  it('consent is checked for the calling session, not a hardcoded one', async () => {
    const seen: string[] = [];
    const deps = buildDeps({
      hasConsent: async (sessionId) => {
        seen.push(sessionId);
        return true;
      },
    });
    await trackMetaEvent(deps, { eventName: 'view_menu', sessionId: 'session-abc' });
    expect(seen).toEqual(['session-abc']);
  });
});

describe('trackMetaEvent — "request events never emit purchase/booking confirmation"', () => {
  it('only ever sends one of the closed, request-semantic event names', async () => {
    const client = fakeClient();
    const deps = buildDeps({ client });
    for (const eventName of [
      'view_menu',
      'add_to_cart',
      'submit_order_request',
      'submit_booking_request',
      'submit_event_request',
      'contact',
      'lead',
    ] as const) {
      await trackMetaEvent(deps, { eventName, sessionId: 'session-1' });
    }
    const sentNames = client.calls.map((c) => c.eventName);
    expect(sentNames).not.toContain('purchase');
    expect(sentNames).not.toContain('Purchase');
    expect(sentNames).not.toContain('booking_confirmed');
    expect(sentNames).toEqual([
      'view_menu',
      'add_to_cart',
      'submit_order_request',
      'submit_booking_request',
      'submit_event_request',
      'contact',
      'lead',
    ]);
  });
});

describe('trackMetaEvent — best-effort delivery, never fails the caller', () => {
  it('still returns sent:true with the eventId when the client rejects, and logs only a type name', async () => {
    const logger = fakeLogger();
    const deps = buildDeps({ client: fakeClient('reject'), logger });
    const result = await trackMetaEvent(deps, {
      eventName: 'contact',
      sessionId: 'session-1',
      correlationId: 'corr-1',
    });
    expect(result).toEqual({ sent: true, eventId: 'fixed-event-id' });

    const warnLog = logger.calls.find((c) => c.level === 'warn');
    expect(warnLog).toBeDefined();
    expect(JSON.stringify(warnLog)).not.toContain('token abc123');
    expect(warnLog?.fields?.errorType).toBe('Error');
    expect(warnLog?.fields?.correlationId).toBe('corr-1');
  });

  it('never throws to the caller', async () => {
    const deps = buildDeps({ client: fakeClient('reject') });
    await expect(
      trackMetaEvent(deps, { eventName: 'lead', sessionId: 'session-1' }),
    ).resolves.toBeDefined();
  });
});

describe('trackMetaEvent — bounded timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a client that never resolves still resolves within META_EVENT_TIMEOUT_MS, never hanging the caller', async () => {
    const deps = buildDeps({ client: fakeClient('hang') });
    const resultPromise = trackMetaEvent(deps, { eventName: 'view_menu', sessionId: 'session-1' });

    await vi.advanceTimersByTimeAsync(3000);

    const result = await resultPromise;
    expect(result).toEqual({ sent: true, eventId: 'fixed-event-id' });
  });
});
