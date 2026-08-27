import { describe, expect, it } from 'vitest';
import {
  createAnthropicChatClient,
  fromAnthropicContent,
  fromAnthropicStopReason,
  toAnthropicContent,
} from '../../src/modules/integrations/anthropic-client';

describe('createAnthropicChatClient', () => {
  it('never throws at construction, even with no ANTHROPIC_API_KEY configured', () => {
    // The key is only read lazily inside sendMessage — constructing the
    // client (e.g. at module load in modules/concierge/deps.ts) must never
    // crash an unrelated route.
    expect(() => createAnthropicChatClient()).not.toThrow();
  });
});

describe('toAnthropicContent', () => {
  it('passes a plain string through unchanged', () => {
    expect(toAnthropicContent('hello')).toBe('hello');
  });

  it('translates a text block', () => {
    expect(toAnthropicContent([{ type: 'text', text: 'hi' }])).toEqual([
      { type: 'text', text: 'hi' },
    ]);
  });

  it('translates a tool_use block', () => {
    expect(
      toAnthropicContent([
        { type: 'tool_use', id: 'tu_1', name: 'getMenu', input: { query: 'x' } },
      ]),
    ).toEqual([{ type: 'tool_use', id: 'tu_1', name: 'getMenu', input: { query: 'x' } }]);
  });

  it('translates a tool_result block, mapping toolUseId to tool_use_id and isError to is_error', () => {
    expect(
      toAnthropicContent([
        { type: 'tool_result', toolUseId: 'tu_1', content: '{"ok":true}', isError: false },
      ]),
    ).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_1', content: '{"ok":true}', is_error: false },
    ]);
  });
});

describe('fromAnthropicContent', () => {
  it('translates a text block', () => {
    expect(fromAnthropicContent([{ type: 'text', text: 'hi', citations: null }])).toEqual([
      { type: 'text', text: 'hi' },
    ]);
  });

  it('translates a tool_use block', () => {
    expect(
      fromAnthropicContent([
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'getMenu',
          input: { query: 'x' },
          caller: { type: 'direct' },
        },
      ]),
    ).toEqual([{ type: 'tool_use', id: 'tu_1', name: 'getMenu', input: { query: 'x' } }]);
  });

  it('drops an unrecognized block type (e.g. thinking) rather than crashing', () => {
    expect(
      fromAnthropicContent([{ type: 'thinking', thinking: 'reasoning...', signature: 'x' }]),
    ).toEqual([]);
  });

  it('round-trips a mixed array in order', () => {
    const input = [
      { type: 'text' as const, text: 'Let me check.', citations: null },
      {
        type: 'tool_use' as const,
        id: 'tu_1',
        name: 'getVenueInfo',
        input: { topic: 'HOURS' },
        caller: { type: 'direct' as const },
      },
    ];
    expect(fromAnthropicContent(input)).toEqual([
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_use', id: 'tu_1', name: 'getVenueInfo', input: { topic: 'HOURS' } },
    ]);
  });
});

describe('fromAnthropicStopReason', () => {
  it('maps every known reason', () => {
    expect(fromAnthropicStopReason('end_turn')).toBe('end_turn');
    expect(fromAnthropicStopReason('tool_use')).toBe('tool_use');
    expect(fromAnthropicStopReason('max_tokens')).toBe('max_tokens');
  });

  it('maps an unknown/null reason to "other" rather than throwing', () => {
    expect(fromAnthropicStopReason(null)).toBe('other');
    expect(fromAnthropicStopReason('stop_sequence')).toBe('other');
    expect(fromAnthropicStopReason('pause_turn')).toBe('other');
  });
});
