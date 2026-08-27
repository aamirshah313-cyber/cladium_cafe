/**
 * Provider-neutral chat client + the real Anthropic-backed adapter —
 * Runbook Step 27 (ADR-0005: "The Anthropic Messages API is called only
 * from server-only routes"; ADR-0008: provider-neutral adapters).
 *
 * `modules/concierge/orchestrator.ts` depends only on `ChatClient` — never
 * on `@anthropic-ai/sdk`'s own types — so swapping the model provider later
 * means reimplementing this adapter only, exactly ADR-0005's stated
 * reversibility goal. No live `ANTHROPIC_API_KEY` exists in this sandbox;
 * `createAnthropicChatClient()` is written and typechecked against the SDK
 * but has never been called against the real API here. Construction is
 * cheap and never throws — the key is only read (and only ever fails
 * closed) inside `sendMessage`, the same "fail only when actually used"
 * shape as `parseSessionSecret`/`parseCronSecret`, so importing this module
 * can never crash an unrelated route at load time.
 */

import Anthropic from '@anthropic-ai/sdk';
import { assertServerOnly } from '../../lib/server-only';
import { parseAnthropicApiKey } from '../../lib/env.server';

assertServerOnly('src/modules/integrations/anthropic-client.ts');

export type ChatRole = 'user' | 'assistant';

export type ChatContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: 'tool_result';
      readonly toolUseId: string;
      readonly content: string;
      readonly isError?: boolean;
    };

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string | readonly ChatContentBlock[];
}

/** JSON-schema-shaped, hand-written per tool (`modules/concierge/tool-registry.ts`) — never auto-derived in a way that could silently drop `additionalProperties: false`. */
export interface ChatToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export type ChatStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'other';

export interface SendMessageInput {
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly ChatToolDefinition[];
  readonly maxTokens: number;
}

export interface SendMessageResult {
  readonly content: readonly ChatContentBlock[];
  readonly stopReason: ChatStopReason;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

export interface ChatClient {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}

const MODEL = 'claude-sonnet-5' as const;

/** Exported for direct unit testing — the real API call itself cannot be tested without a live `ANTHROPIC_API_KEY`, but this translation must be exactly right regardless. */
export function toAnthropicContent(
  content: string | readonly ChatContentBlock[],
): Anthropic.Messages.MessageParam['content'] {
  if (typeof content === 'string') return content;
  return content.map((block): Anthropic.Messages.ContentBlockParam => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    }
    return {
      type: 'tool_result',
      tool_use_id: block.toolUseId,
      content: block.content,
      is_error: block.isError,
    };
  });
}

export function fromAnthropicContent(
  content: readonly Anthropic.Messages.ContentBlock[],
): readonly ChatContentBlock[] {
  return content.flatMap((block): ChatContentBlock[] => {
    if (block.type === 'text') return [{ type: 'text', text: block.text }];
    if (block.type === 'tool_use') {
      return [{ type: 'tool_use', id: block.id, name: block.name, input: block.input }];
    }
    return []; // thinking/other block types carry nothing the orchestrator needs.
  });
}

export function fromAnthropicStopReason(reason: string | null): ChatStopReason {
  if (reason === 'end_turn') return 'end_turn';
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'other';
}

/** Never throws at construction — see module doc comment. */
export function createAnthropicChatClient(): ChatClient {
  let client: Anthropic | null = null;

  return {
    async sendMessage(input) {
      if (!client) client = new Anthropic({ apiKey: parseAnthropicApiKey() });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: input.messages.map((message) => ({
          role: message.role,
          content: toAnthropicContent(message.content),
        })),
        tools: input.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
        })),
      });

      return {
        content: fromAnthropicContent(response.content),
        stopReason: fromAnthropicStopReason(response.stop_reason),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}
