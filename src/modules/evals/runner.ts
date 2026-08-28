/**
 * Eval suite runner — Runbook Step 29.
 *
 * Runs each `requiresLiveModel: false` case through the *real*
 * `orchestrateTurn` (never a reimplementation) against a scripted fake
 * `ChatClient` built from the case's own `scriptedTurns` — the same
 * fake-client pattern `tests/unit/concierge-orchestrator.test.ts` already
 * uses. A fresh conversation store, rate limiter, and unique session id
 * are built per case so cases never interfere with each other's state.
 * `requiresLiveModel: true` cases are skipped, visibly, with a reason —
 * never faked and never silently counted as passing.
 */

import { createLogger } from '../../lib/logging';
import { createInMemoryRateLimiter } from '../../lib/security/rate-limit';
import { createInMemoryConversationStore } from '../concierge/conversation-store';
import { orchestrateTurn, type OrchestratorDeps } from '../concierge/orchestrator';
import type {
  ChatClient,
  ChatContentBlock,
  SendMessageResult,
} from '../integrations/anthropic-client';
import type { EvalCase, EvalCaseResult, EvalReport, EvalTranscript } from './types';

function extractToolNames(turns: readonly SendMessageResult[]): readonly string[] {
  return turns.flatMap((turn) =>
    turn.content
      .filter(
        (block): block is Extract<ChatContentBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use',
      )
      .map((block) => block.name),
  );
}

function scriptedChatClient(
  scriptedTurns: readonly SendMessageResult[],
  systemPromptsSeen: string[],
): ChatClient {
  let callIndex = 0;
  return {
    async sendMessage(input) {
      systemPromptsSeen.push(input.system);
      const turn = scriptedTurns[callIndex];
      callIndex += 1;
      if (!turn) {
        // The script ran out of turns — treat as the model stopping, a safe default rather than a crash.
        return {
          content: [{ type: 'text', text: '' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      }
      return turn;
    },
  };
}

export async function runEvalCase(evalCase: EvalCase): Promise<EvalCaseResult> {
  if (evalCase.requiresLiveModel) {
    return {
      id: evalCase.id,
      category: evalCase.category,
      critical: evalCase.critical,
      skipped: true,
      skipReason: 'requires a live ANTHROPIC_API_KEY, not available in this sandbox (D-031)',
      pass: false,
      failures: [],
    };
  }

  const systemPromptsSeen: string[] = [];
  const deps: OrchestratorDeps = {
    chatClient: scriptedChatClient(evalCase.scriptedTurns ?? [], systemPromptsSeen),
    conversationStore: createInMemoryConversationStore(),
    rateLimiter: createInMemoryRateLimiter(),
    logger: createLogger(),
  };

  const result = await orchestrateTurn(deps, {
    sessionId: `eval-session-${evalCase.id}`,
    locale: evalCase.locale,
    userMessage: evalCase.userMessage,
    correlationId: `eval-${evalCase.id}`,
  });

  const transcript: EvalTranscript = result.ok
    ? {
        reply: result.value.reply,
        escalate: result.value.escalate,
        pendingConfirmation: result.value.pendingConfirmation
          ? {
              kind: result.value.pendingConfirmation.kind,
              review: result.value.pendingConfirmation.review,
            }
          : undefined,
        systemPromptsSeen,
        toolCallsSeen: extractToolNames(evalCase.scriptedTurns ?? []),
      }
    : {
        reply: '',
        escalate: true,
        pendingConfirmation: undefined,
        systemPromptsSeen,
        toolCallsSeen: [],
      };

  const failures = evalCase.assertions
    .map((assertion) => assertion(transcript))
    .filter((outcome) => !outcome.pass)
    .map((outcome) => outcome.reason);

  return {
    id: evalCase.id,
    category: evalCase.category,
    critical: evalCase.critical,
    skipped: false,
    pass: result.ok && failures.length === 0,
    failures: result.ok ? failures : ['orchestrateTurn itself returned an error result'],
  };
}

export async function runEvalSuite(
  cases: readonly EvalCase[],
  suiteVersion: string,
): Promise<EvalReport> {
  const results = await Promise.all(cases.map(runEvalCase));

  const ran = results.filter((r) => !r.skipped);
  const passed = ran.filter((r) => r.pass);
  const failed = ran.filter((r) => !r.pass);
  const criticalFailed = failed.filter((r) => r.critical);

  return {
    suiteVersion,
    results,
    totals: {
      total: results.length,
      skipped: results.length - ran.length,
      ran: ran.length,
      passed: passed.length,
      failed: failed.length,
      criticalFailed: criticalFailed.length,
    },
  };
}
