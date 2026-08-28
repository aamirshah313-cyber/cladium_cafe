/**
 * Vapi server-message (tool-call/webhook) envelope — Runbook Step 32
 * (ADR-0006: HMAC-SHA256, timestamp freshness, replay rejection, `toolCallId`
 * idempotency).
 *
 * `vapiToolCallWebhookSchema`'s shape (`message.type`/`toolCallList`/`call`)
 * is a **best-effort mapping to Vapi's documented "Server URL" tool-calls
 * message format, never verified against live Vapi traffic in this
 * sandbox** — the same standing limitation `vapi-client.ts` flags for its
 * token-restriction claims (D-035) and `voice/profiles/` flags for the
 * assistant-creation procedure (D-034). Deliberately *not* `strictObject`:
 * this is a third-party payload that will legitimately carry fields this
 * codebase doesn't know about yet, unlike our own API contracts where an
 * unknown field is a client bug worth rejecting. Confirm this shape against
 * Vapi's current docs before any real call depends on it; if it differs,
 * only this schema (and `execute-vapi-tool-calls.ts`'s reads of it) needs
 * to change.
 *
 * `function.arguments` is typed as `string | Record<string, unknown>`
 * because tool-call argument encoding varies by provider convention (some
 * send a parsed object, others — OpenAI-style function calling among them —
 * send a JSON-encoded string); `parseToolArguments` normalizes either.
 */

import { z } from 'zod';
import type { VapiCredentials } from '../../lib/env.server';
import type { Locale } from '../../lib/i18n/locale';

export const vapiFunctionCallSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
  function: z.object({
    name: z.string().min(1),
    arguments: z.union([z.record(z.string(), z.unknown()), z.string()]),
  }),
});

export type VapiFunctionCall = z.infer<typeof vapiFunctionCallSchema>;

export const vapiToolCallWebhookSchema = z.object({
  message: z.object({
    type: z.literal('tool-calls'),
    toolCallList: z.array(vapiFunctionCallSchema).min(1),
    call: z.object({
      id: z.string().min(1),
      assistantId: z.string().min(1).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
});

export type VapiToolCallWebhookPayload = z.infer<typeof vapiToolCallWebhookSchema>;

/** Loose envelope for the generic lifecycle-event webhook — only `message.type` is ever read. */
export const vapiGenericEventSchema = z.object({
  message: z.object({
    type: z.string().min(1),
  }),
});

/** `{}` (not `null`/throwing) on malformed input — `arguments` is best-effort, never trusted structurally before the per-tool zod schema in `tool-registry.ts` validates it for real. */
export function parseToolArguments(raw: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof raw !== 'string') return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Derives the caller's locale from which of our own two configured
 * assistant ids the call belongs to — authoritative and server-controlled,
 * unlike trusting a client-supplied `metadata.locale` field. Falls back to
 * English when the assistant id is absent or matches neither (never
 * throws — an unrecognized assistant id should degrade gracefully, not
 * break tool execution for what is otherwise a validly-signed webhook).
 */
export function localeForAssistantId(
  assistantId: string | undefined,
  credentials: Pick<VapiCredentials, 'VAPI_ASSISTANT_EN_ID' | 'VAPI_ASSISTANT_UR_ID'>,
): Locale {
  return assistantId === credentials.VAPI_ASSISTANT_UR_ID ? 'ur' : 'en';
}

/**
 * A `call.metadata.sessionId` set by the browser at call-start time
 * (`modules/voice`'s later web-UI step) would let a voice call see the same
 * cart/request-status a guest's text session sees; until that exists, a
 * call-scoped synthetic id keeps every call's tool results correctly
 * isolated (never colliding across two different real Vapi calls) without
 * ever needing to trust unauthenticated client metadata for isolation
 * itself — a missing real session id degrades to "no cart found," never a
 * cross-guest data leak.
 */
export function sessionIdForCall(
  callId: string,
  metadata: Record<string, unknown> | undefined,
): string {
  const candidate = metadata?.sessionId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : `voice:${callId}`;
}

export interface VapiToolResult {
  readonly toolCallId: string;
  readonly result: string;
}

/** The exact response shape Vapi's tool-calls server message expects. */
export function buildVapiToolCallResponse(results: readonly VapiToolResult[]): {
  results: readonly VapiToolResult[];
} {
  return { results };
}
