/**
 * Executes a Vapi tool-calls webhook delivery — Runbook Step 32.
 *
 * Dispatches through `modules/concierge/tool-registry.ts#dispatchToolCall`
 * — the exact same registry and domain services text chat's orchestrator
 * (Step 27) calls, never a second implementation — so "the voice agent
 * passes the same...tests as text chat" (`deployment-target.md`) by
 * construction rather than by parallel maintenance. Each individual tool
 * call's result is serialized identically to `orchestrator.ts`'s own
 * `tool_result` content (`JSON.stringify(ok ? value : {error: message})`),
 * the same convention for the same reason.
 *
 * Bounded execution: at most `MAX_TOOL_CALLS_PER_WEBHOOK` calls are ever
 * dispatched from one delivery (extra calls in an oversized list get a
 * bounded-rejection result, never silently dropped or executed anyway —
 * Vapi/the model still gets an honest per-call answer); each dispatch is
 * raced against `TOOL_CALL_TIMEOUT_MS` so one hung domain call can never
 * block the whole webhook response. `toolCallId` idempotency reuses Step
 * 19's `runIdempotent`/`IdempotencyStore` unchanged — the same "same
 * key+fingerprint replays, different fingerprint or in-flight duplicate is
 * rejected" contract every submission service already relies on, just a
 * new scope (`vapi-tool-call`) and a new key source (Vapi's own
 * `toolCallId`, which is the exact "at-least-once delivery" identifier
 * `production-architecture-v2.md` §9 names for this purpose).
 */

import { createHash } from 'node:crypto';
import { dispatchToolCall } from '../../concierge/tool-registry';
import { runIdempotent, type IdempotencyStore } from '../../../lib/domain/idempotency';
import { ok, type Result } from '../../../lib/result';
import { internalError, type AppError } from '../../../lib/errors';
import type { Locale } from '../../../lib/i18n/locale';
import {
  parseToolArguments,
  type VapiFunctionCall,
  type VapiToolResult,
} from '../../integrations/vapi-webhook';

export const MAX_TOOL_CALLS_PER_WEBHOOK = 5;
export const TOOL_CALL_TIMEOUT_MS = 8_000;

export interface ExecuteVapiToolCallsDeps {
  readonly idempotencyStore: IdempotencyStore<unknown>;
  readonly now?: () => Date;
  /**
   * Defaults to the real `dispatchToolCall` — injectable so this
   * codebase's own tests can deterministically exercise the timeout race
   * (a fake dispatcher that never resolves) without depending on a real
   * tool being artificially slow.
   */
  readonly dispatch?: typeof dispatchToolCall;
}

export interface ExecuteVapiToolCallsInput {
  readonly toolCallList: readonly VapiFunctionCall[];
  readonly sessionId: string;
  readonly locale: Locale;
  readonly correlationId: string;
}

function fingerprintOf(name: string, args: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify({ name, args })).digest('hex');
}

function serializeDispatchResult(result: Result<unknown, AppError>): string {
  return JSON.stringify(result.ok ? result.value : { error: result.error.message });
}

function timeoutResult(ms: number): Promise<Result<unknown, AppError>> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: false, error: internalError('Tool call timed out.') }), ms);
  });
}

async function executeOne(
  deps: ExecuteVapiToolCallsDeps,
  toolCall: VapiFunctionCall,
  context: { readonly sessionId: string; readonly locale: Locale; readonly correlationId: string },
): Promise<VapiToolResult> {
  const now = deps.now ?? (() => new Date());
  const dispatch = deps.dispatch ?? dispatchToolCall;
  const args = parseToolArguments(toolCall.function.arguments);
  const fingerprint = fingerprintOf(toolCall.function.name, args);

  const raced = (): Promise<Result<unknown, AppError>> =>
    Promise.race([
      dispatch(toolCall.function.name, args, context),
      timeoutResult(TOOL_CALL_TIMEOUT_MS),
    ]);

  const result = await runIdempotent(
    deps.idempotencyStore,
    {
      scope: 'vapi-tool-call',
      key: toolCall.id,
      fingerprint,
      now,
      correlationId: context.correlationId,
    },
    raced,
  );

  return { toolCallId: toolCall.id, result: serializeDispatchResult(result) };
}

/** Never throws — a single failed/timed-out tool call resolves to an error-shaped result for its own `toolCallId`, never an unhandled rejection that would drop the whole delivery. */
export async function executeVapiToolCalls(
  deps: ExecuteVapiToolCallsDeps,
  input: ExecuteVapiToolCallsInput,
): Promise<readonly VapiToolResult[]> {
  const context = {
    sessionId: input.sessionId,
    locale: input.locale,
    correlationId: input.correlationId,
  };
  const bounded = input.toolCallList.slice(0, MAX_TOOL_CALLS_PER_WEBHOOK);
  const overflow = input.toolCallList.slice(MAX_TOOL_CALLS_PER_WEBHOOK);

  const executed = await Promise.all(
    bounded.map((toolCall) => executeOne(deps, toolCall, context)),
  );
  const rejected = overflow.map((toolCall): VapiToolResult => ({
    toolCallId: toolCall.id,
    result: JSON.stringify({ error: 'Too many tool calls in one request.' }),
  }));

  return [...executed, ...rejected];
}
