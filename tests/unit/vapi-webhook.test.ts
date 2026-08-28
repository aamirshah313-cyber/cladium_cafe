import { describe, expect, it } from 'vitest';
import {
  buildVapiToolCallResponse,
  localeForAssistantId,
  parseToolArguments,
  sessionIdForCall,
  vapiGenericEventSchema,
  vapiToolCallWebhookSchema,
} from '../../src/modules/integrations/vapi-webhook';
import { validServerEnv } from '../fixtures/env';

describe('parseToolArguments', () => {
  it('passes an already-parsed object through unchanged', () => {
    expect(parseToolArguments({ query: 'burger' })).toEqual({ query: 'burger' });
  });

  it('parses a JSON-encoded string (OpenAI-style function-call convention)', () => {
    expect(parseToolArguments('{"topic":"HOURS"}')).toEqual({ topic: 'HOURS' });
  });

  it('degrades to {} for invalid JSON rather than throwing', () => {
    expect(parseToolArguments('not-json{')).toEqual({});
  });

  it('degrades to {} for a JSON string that parses to a non-object (e.g. a bare number)', () => {
    expect(parseToolArguments('42')).toEqual({});
  });
});

describe('localeForAssistantId', () => {
  const credentials = {
    VAPI_ASSISTANT_EN_ID: validServerEnv.VAPI_ASSISTANT_EN_ID,
    VAPI_ASSISTANT_UR_ID: validServerEnv.VAPI_ASSISTANT_UR_ID,
  };

  it('resolves the Urdu assistant id to ur', () => {
    expect(localeForAssistantId(credentials.VAPI_ASSISTANT_UR_ID, credentials)).toBe('ur');
  });

  it('resolves the English assistant id to en', () => {
    expect(localeForAssistantId(credentials.VAPI_ASSISTANT_EN_ID, credentials)).toBe('en');
  });

  it('falls back to en for an unrecognized assistant id, never throwing', () => {
    expect(localeForAssistantId('some-unknown-assistant', credentials)).toBe('en');
  });

  it('falls back to en when assistantId is absent', () => {
    expect(localeForAssistantId(undefined, credentials)).toBe('en');
  });
});

describe('sessionIdForCall', () => {
  it('prefers a real sessionId from assistantOverrides.metadata — the confirmed real Vapi path', () => {
    expect(
      sessionIdForCall('call_1', {
        assistantOverrides: { metadata: { sessionId: 'guest-session-abc' } },
      }),
    ).toBe('guest-session-abc');
  });

  it('falls back to call.metadata.sessionId when assistantOverrides is absent (defensive legacy path)', () => {
    expect(sessionIdForCall('call_1', { metadata: { sessionId: 'guest-session-xyz' } })).toBe(
      'guest-session-xyz',
    );
  });

  it('assistantOverrides.metadata wins over call.metadata when both are present', () => {
    expect(
      sessionIdForCall('call_1', {
        metadata: { sessionId: 'from-legacy-path' },
        assistantOverrides: { metadata: { sessionId: 'from-real-path' } },
      }),
    ).toBe('from-real-path');
  });

  it('falls back to a call-scoped synthetic id when neither metadata source is present', () => {
    expect(sessionIdForCall('call_1', {})).toBe('voice:call_1');
  });

  it('falls back to a call-scoped synthetic id when sessionId is not a non-empty string', () => {
    expect(
      sessionIdForCall('call_1', { assistantOverrides: { metadata: { sessionId: '' } } }),
    ).toBe('voice:call_1');
    expect(
      sessionIdForCall('call_1', { assistantOverrides: { metadata: { sessionId: 42 } } }),
    ).toBe('voice:call_1');
  });

  it('two different calls never collide on the fallback synthetic id', () => {
    expect(sessionIdForCall('call_1', {})).not.toBe(sessionIdForCall('call_2', {}));
  });
});

describe('buildVapiToolCallResponse', () => {
  it('wraps results under the exact key Vapi expects', () => {
    const results = [{ toolCallId: 'c1', result: '{}' }];
    expect(buildVapiToolCallResponse(results)).toEqual({ results });
  });
});

describe('vapiToolCallWebhookSchema', () => {
  it('accepts a well-formed tool-calls envelope', () => {
    const parsed = vapiToolCallWebhookSchema.safeParse({
      message: {
        type: 'tool-calls',
        toolCallList: [
          { id: 'c1', type: 'function', function: { name: 'getMenu', arguments: {} } },
        ],
        call: { id: 'call_1', assistantId: 'asst_1', metadata: { sessionId: 's1' } },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts call.assistantOverrides.metadata — the confirmed real path for a passed-through sessionId', () => {
    const parsed = vapiToolCallWebhookSchema.safeParse({
      message: {
        type: 'tool-calls',
        toolCallList: [
          { id: 'c1', type: 'function', function: { name: 'getMenu', arguments: {} } },
        ],
        call: { id: 'call_1', assistantOverrides: { metadata: { sessionId: 's1' } } },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts arguments as a JSON-encoded string', () => {
    const parsed = vapiToolCallWebhookSchema.safeParse({
      message: {
        type: 'tool-calls',
        toolCallList: [{ id: 'c1', function: { name: 'getMenu', arguments: '{"query":"tea"}' } }],
        call: { id: 'call_1' },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('tolerates unknown extra fields from a third-party payload (not a strict schema)', () => {
    const parsed = vapiToolCallWebhookSchema.safeParse({
      message: {
        type: 'tool-calls',
        toolCallList: [{ id: 'c1', function: { name: 'getMenu', arguments: {} } }],
        call: { id: 'call_1' },
        somethingVapiAddsLater: true,
      },
      extraTopLevelField: 'ignored',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty toolCallList', () => {
    const parsed = vapiToolCallWebhookSchema.safeParse({
      message: { type: 'tool-calls', toolCallList: [], call: { id: 'call_1' } },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects the wrong message.type', () => {
    const parsed = vapiToolCallWebhookSchema.safeParse({
      message: { type: 'status-update', toolCallList: [], call: { id: 'call_1' } },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a completely malformed payload', () => {
    expect(vapiToolCallWebhookSchema.safeParse({ not: 'a valid envelope' }).success).toBe(false);
    expect(vapiToolCallWebhookSchema.safeParse(null).success).toBe(false);
    expect(vapiToolCallWebhookSchema.safeParse('a string').success).toBe(false);
  });
});

describe('vapiGenericEventSchema', () => {
  it('accepts any message with a type', () => {
    expect(vapiGenericEventSchema.safeParse({ message: { type: 'status-update' } }).success).toBe(
      true,
    );
    expect(
      vapiGenericEventSchema.safeParse({ message: { type: 'end-of-call-report' } }).success,
    ).toBe(true);
  });

  it('rejects a payload with no message.type', () => {
    expect(vapiGenericEventSchema.safeParse({ message: {} }).success).toBe(false);
    expect(vapiGenericEventSchema.safeParse({}).success).toBe(false);
  });
});
