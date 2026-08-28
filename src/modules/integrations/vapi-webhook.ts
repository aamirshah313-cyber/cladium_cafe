/**
 * Vapi server-message (tool-call/webhook) envelope — Runbook Step 32
 * (ADR-0006: HMAC-SHA256, timestamp freshness, replay rejection, `toolCallId`
 * idempotency).
 *
 * `vapiToolCallWebhookSchema`'s `message.type`/`toolCallList`/`toolCallList[].
 * {id,type,function.{name,arguments}}` shape is now **verified**, not
 * guessed: Step 33 installed `@vapi-ai/web` (the real client SDK) to build
 * the voice web experience, and its bundled `dist/api.d.ts` ships Vapi's own
 * `ServerMessageToolCalls`/`ToolCall`/`ToolCallFunction` types, which this
 * schema matches field-for-field (`arguments` really is always a string on
 * the wire — the `Record<string, unknown>` half of the union stays only as
 * defensive tolerance, not because real traffic sends it). `call.
 * assistantOverrides.metadata` is similarly confirmed real (`Call.
 * assistantOverrides?: AssistantOverrides`, `AssistantOverrides.metadata?:
 * object`) — this is where a guest's real `sessionId`, set via `vapi.start(
 * assistantId, { metadata: { sessionId } })` (`voice-panel.tsx`), actually
 * surfaces server-side, not `call.metadata` directly as originally guessed
 * when this module was first written with no SDK installed. `call.metadata`
 * itself is kept as a defensive fallback read, never assumed authoritative.
 * Deliberately *not* `strictObject`: this is a third-party payload that
 * legitimately carries many fields this codebase doesn't read yet, unlike
 * our own API contracts where an unknown field is a client bug worth
 * rejecting.
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
      /** Legacy/defensive read path — the confirmed real path is `assistantOverrides.metadata`, below. */
      metadata: z.record(z.string(), z.unknown()).optional(),
      assistantOverrides: z
        .object({
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
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
 * `voice-panel.tsx` (Step 33) passes the guest's real session id via
 * `vapi.start(assistantId, { metadata: { sessionId } })`, which surfaces
 * server-side as `call.assistantOverrides.metadata.sessionId` (confirmed
 * against `@vapi-ai/web`'s own types — see this module's doc comment);
 * `call.metadata.sessionId` is checked too, defensively, in case a future
 * Vapi payload surfaces it there instead. Either path lets a voice call see
 * the same cart/request-status a guest's text session sees. Absent both, a
 * call-scoped synthetic id keeps every call's tool results correctly
 * isolated (never colliding across two different real Vapi calls) without
 * ever needing to trust unauthenticated client metadata for isolation
 * itself — a missing real session id degrades to "no cart found," never a
 * cross-guest data leak.
 */
export function sessionIdForCall(
  callId: string,
  call: {
    readonly metadata?: Record<string, unknown>;
    readonly assistantOverrides?: { readonly metadata?: Record<string, unknown> };
  },
): string {
  const fromOverrides = call.assistantOverrides?.metadata?.sessionId;
  const fromLegacy = call.metadata?.sessionId;
  const candidate =
    typeof fromOverrides === 'string' && fromOverrides.length > 0 ? fromOverrides : fromLegacy;
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
