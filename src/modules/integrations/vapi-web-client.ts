/**
 * Thin real-adapter isolation for `@vapi-ai/web` — Runbook Step 33.
 *
 * `voice-panel.tsx` imports `VoiceCallClient`/`createVoiceCallClient` from
 * here, never `@vapi-ai/web` directly — the same "one small module owns the
 * real SDK import" shape `anthropic-client.ts`/`vapi-client.ts` already use
 * (ADR-0008), so a future SDK-major-version change or provider swap touches
 * one file. `Vapi`'s own public surface (`start`/`stop`/`on`/`setMuted`/
 * `isMuted`, and the real event names below) is already minimal enough that
 * this file adds no extra abstraction on top — it constructs the client
 * with the short-lived public token from `POST /api/vapi/token` (Step 31)
 * and re-exports the SDK's own type for callers.
 *
 * `startVoiceCall` never opts into recording (`assistantOverrides` here
 * never sets a recording field, and `startRecording()`/`stopRecording()`
 * are simply never called anywhere in this codebase) — `CLAUDE.md`:
 * "Recording is off by default."
 */

import Vapi from '@vapi-ai/web';

export type VoiceCallClient = Vapi;

/** `publicToken` is the short-lived, origin/assistant-restricted JWT `POST /api/vapi/token` issues — never a long-lived key. */
export function createVoiceCallClient(publicToken: string): VoiceCallClient {
  return new Vapi(publicToken);
}

export interface StartVoiceCallInput {
  readonly assistantId: string;
  /** Surfaces server-side as `call.assistantOverrides.metadata` (`modules/integrations/vapi-webhook.ts`'s doc comment) — this is how a real guest session id reaches `/api/vapi/tools`. */
  readonly sessionId: string;
}

export async function startVoiceCall(
  client: VoiceCallClient,
  input: StartVoiceCallInput,
): Promise<void> {
  await client.start(input.assistantId, { metadata: { sessionId: input.sessionId } });
}
