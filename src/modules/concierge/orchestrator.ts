/**
 * Bounded server-side chat orchestration — Runbook Step 27 (ADR-0005: "The
 * orchestration loop is bounded by tool-call, token, and time limits with
 * a safe staff/WhatsApp fallback").
 *
 * One call = one guest turn: rate-limit, load bounded server-held history
 * (never browser-supplied — `conversation-store.ts`), run a bounded
 * tool-call loop against the model, persist only the final exchange, and
 * always resolve to a safe reply — a model/tool/network failure, a tool
 * loop that never terminates, or a turn that runs too long all become the
 * same kind of outcome: a plain-language fallback reply with
 * `escalate: true`, never a thrown exception or a leaked internal detail.
 *
 * `system` is always exactly `CONCIERGE_SYSTEM_POLICY` — never built from
 * `input.userMessage` or prior history — so nothing a guest types can ever
 * reach the model as an instruction rather than conversation content; the
 * same is true of every tool result, which only ever enters the message
 * array as a `tool_result` block (an untrusted-data role Anthropic's API
 * itself never treats as instructions), never appended to `system`.
 */

import { err, ok, type Result } from '../../lib/result';
import { rateLimited, validationFailed, type AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logging';
import type { Locale } from '../../lib/i18n/locale';
import type { RateLimitRule, RateLimiter } from '../../lib/security/rate-limit';
import type { ChatClient, ChatContentBlock, ChatMessage } from '../integrations/anthropic-client';
import { CONCIERGE_SYSTEM_POLICY } from './policy';
import { TOOL_DEFINITIONS, dispatchToolCall } from './tool-registry';
import type { ConversationStore } from './conversation-store';
import { WHATSAPP_DISPLAY } from '../business/facts';

export const MAX_USER_MESSAGE_LENGTH = 2000;
export const MAX_TOOL_CALLS_PER_TURN = 5;
export const MAX_TOKENS_PER_MODEL_CALL = 1024;
export const MAX_TOTAL_TOKENS_PER_TURN = 8000;
export const TURN_TIMEOUT_MS = 20_000;
export const RATE_LIMIT_RULE: RateLimitRule = { windowMs: 60_000, max: 10 };

const FALLBACK_REPLY = `Sorry, I couldn't finish that. Please try again, or reach us directly on WhatsApp (${WHATSAPP_DISPLAY}).`;
const ESCALATION_REPLY = `That needs more than I can help with right now — please reach us on WhatsApp (${WHATSAPP_DISPLAY}) and our team will help directly.`;

export interface OrchestratorDeps {
  readonly chatClient: ChatClient;
  readonly conversationStore: ConversationStore;
  readonly rateLimiter: RateLimiter;
  readonly logger: Logger;
  readonly now?: () => Date;
}

export interface OrchestrateTurnInput {
  readonly sessionId: string;
  readonly locale: Locale;
  readonly userMessage: string;
  readonly correlationId: string;
}

export interface OrchestrateTurnResult {
  readonly reply: string;
  readonly escalate: boolean;
}

function textOf(blocks: readonly ChatContentBlock[]): string {
  return blocks
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

export async function orchestrateTurn(
  deps: OrchestratorDeps,
  input: OrchestrateTurnInput,
): Promise<Result<OrchestrateTurnResult, AppError>> {
  const now = deps.now ?? (() => new Date());
  const trimmedMessage = input.userMessage.trim();

  if (trimmedMessage.length === 0 || trimmedMessage.length > MAX_USER_MESSAGE_LENGTH) {
    return err(
      validationFailed([{ path: 'message', code: 'invalid_length' }], input.correlationId),
    );
  }

  const rateDecision = await deps.rateLimiter.consume(
    `concierge:${input.sessionId}`,
    RATE_LIMIT_RULE,
    now(),
  );
  if (!rateDecision.allowed) return err(rateLimited(input.correlationId));

  const existing = await deps.conversationStore.get(input.sessionId, now());
  const priorTurns = existing?.turns ?? [];
  const messages: ChatMessage[] = [
    ...priorTurns.map((turn): ChatMessage => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: trimmedMessage },
  ];

  const deadlineMs = now().getTime() + TURN_TIMEOUT_MS;
  let toolCallCount = 0;
  let totalTokens = 0;
  let reply = FALLBACK_REPLY;
  let escalate = false;

  try {
    while (true) {
      if (now().getTime() > deadlineMs) {
        reply = ESCALATION_REPLY;
        escalate = true;
        break;
      }
      if (totalTokens > MAX_TOTAL_TOKENS_PER_TURN) {
        reply = ESCALATION_REPLY;
        escalate = true;
        break;
      }

      const response = await deps.chatClient.sendMessage({
        system: CONCIERGE_SYSTEM_POLICY,
        messages,
        tools: TOOL_DEFINITIONS,
        maxTokens: MAX_TOKENS_PER_MODEL_CALL,
      });
      totalTokens += response.usage.inputTokens + response.usage.outputTokens;

      const toolUseBlocks = response.content.filter(
        (block): block is { type: 'tool_use'; id: string; name: string; input: unknown } =>
          block.type === 'tool_use',
      );

      if (response.stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
        reply = textOf(response.content) || FALLBACK_REPLY;
        break;
      }

      toolCallCount += toolUseBlocks.length;
      if (toolCallCount > MAX_TOOL_CALLS_PER_TURN) {
        reply = ESCALATION_REPLY;
        escalate = true;
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      const resultBlocks: ChatContentBlock[] = [];
      for (const toolUse of toolUseBlocks) {
        const dispatchResult = await dispatchToolCall(toolUse.name, toolUse.input, {
          sessionId: input.sessionId,
          locale: input.locale,
          correlationId: input.correlationId,
        });
        resultBlocks.push({
          type: 'tool_result',
          toolUseId: toolUse.id,
          content: JSON.stringify(
            dispatchResult.ok ? dispatchResult.value : { error: dispatchResult.error.message },
          ),
          isError: !dispatchResult.ok,
        });
      }
      messages.push({ role: 'user', content: resultBlocks });
    }
  } catch (error) {
    // Never log the raw error/exception message — it could embed request
    // detail from the model SDK. Only a safe, developer-meaningful type name.
    deps.logger.error('concierge.turn_failed', {
      correlationId: input.correlationId,
      toolCalls: toolCallCount,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    return ok({ reply: FALLBACK_REPLY, escalate: true });
  }

  const occurredAt = now().toISOString();
  await deps.conversationStore.append(
    input.sessionId,
    { role: 'user', content: trimmedMessage, occurredAt },
    now(),
  );
  await deps.conversationStore.append(
    input.sessionId,
    { role: 'assistant', content: reply, occurredAt },
    now(),
  );

  deps.logger.info('concierge.turn_completed', {
    correlationId: input.correlationId,
    toolCalls: toolCallCount,
    escalate,
  });

  return ok({ reply, escalate });
}
