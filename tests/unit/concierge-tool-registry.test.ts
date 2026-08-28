import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, dispatchToolCall } from '../../src/modules/concierge/tool-registry';

const CONTEXT = { sessionId: 'session-1', locale: 'en' as const, correlationId: 'corr-1' };

describe('TOOL_DEFINITIONS', () => {
  it('lists exactly the four Step 26 read tools plus the two Step 28 prepare tools', () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual(
      [
        'getMenu',
        'getRequestStatus',
        'getVenueInfo',
        'prepareBookingRequest',
        'prepareEventRequest',
        'viewCart',
      ].sort(),
    );
  });

  it('never lists a submit tool — the model is structurally unable to cause a write', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).not.toContain('submitBookingRequest');
    expect(names).not.toContain('submitEventRequest');
    expect(names).not.toContain('submitTakeawayRequest');
  });

  it('every tool rejects unknown properties at the JSON-schema level', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  it('every tool has a non-empty description', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

describe('dispatchToolCall — valid calls execute the real tool', () => {
  it('getVenueInfo returns the approved fact', async () => {
    const result = await dispatchToolCall('getVenueInfo', { topic: 'CONTACT' }, CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ topic: 'CONTACT' });
  });

  it('getMenu returns UNPUBLISHED, the real current state', async () => {
    const result = await dispatchToolCall('getMenu', {}, CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ status: 'UNPUBLISHED' });
  });

  it('getRequestStatus returns found:false for an unknown request id', async () => {
    const result = await dispatchToolCall(
      'getRequestStatus',
      { requestId: '123e4567-e89b-12d3-a456-426614174000' },
      CONTEXT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ found: false });
  });
});

describe('dispatchToolCall — the two Step 28 prepare tools', () => {
  const BOOKING_INPUT = {
    guestName: 'Aamir Shah',
    guestPhone: '+923001234567',
    requestedDate: '2999-01-01',
    requestedTime: '19:00',
    partySize: 4,
    seatingPreference: 'GENERAL',
  };
  const EVENT_INPUT = {
    guestName: 'Aamir Shah',
    guestPhone: '+923001234567',
    occasion: 'Birthday',
    requestedDate: '2999-01-01',
    requestedTime: '19:00',
    guestCount: 20,
    decorInterest: true,
  };

  it('prepareBookingRequest drafts a review with a confirmation token, never a request record', async () => {
    const result = await dispatchToolCall('prepareBookingRequest', BOOKING_INPUT, CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        review: expect.any(Object),
        confirmationToken: expect.any(String),
      });
    }
  });

  it('prepareEventRequest drafts a review with a confirmation token, never a request record', async () => {
    const result = await dispatchToolCall('prepareEventRequest', EVENT_INPUT, CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        review: expect.any(Object),
        confirmationToken: expect.any(String),
      });
    }
  });
});

describe('dispatchToolCall — a hypothetical submit-tool call name', () => {
  it('resolves NOT_FOUND — there is nothing registered to execute even if the model tried', async () => {
    const result = await dispatchToolCall('submitBookingRequest', {}, CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('dispatchToolCall — unknown tool name', () => {
  it('returns an orchestrator-level NOT_FOUND error, never executes anything', async () => {
    const result = await dispatchToolCall('deleteEverything', {}, CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('dispatchToolCall — malformed input', () => {
  it('a non-object input is an orchestrator-level VALIDATION_FAILED, not a crash', async () => {
    const result = await dispatchToolCall('getVenueInfo', 'not an object', CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED');
  });

  it("an object failing the tool's own schema resolves ok — a self-correctable tool_result the model can retry from, not a hard failure", async () => {
    const result = await dispatchToolCall('getVenueInfo', { topic: 'NOT_A_REAL_TOPIC' }, CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ error: expect.any(String) });
  });

  it('a schema-invalid getRequestStatus (non-UUID) also resolves as a self-correctable error, not a crash', async () => {
    const result = await dispatchToolCall('getRequestStatus', { requestId: 'not-a-uuid' }, CONTEXT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ error: expect.any(String) });
  });
});
