/**
 * Pure voice-call state — Runbook Step 33.
 *
 * `voice-panel.tsx` is thin, real-SDK-wiring glue (`@vapi-ai/web` events →
 * `dispatch(event)`) verified live in the browser, the same way every other
 * page component in this codebase has been since Step 13 — nothing here
 * touches the DOM/WebRTC. This module is the opposite: the actual state
 * machine and error classification, kept pure and exported specifically so
 * this codebase's own tests can exercise "denied permission, device loss,
 * disconnect/reconnect... duplicate tool" (the runbook's own evidence
 * bullet) deterministically, with plain fixture objects, independent of a
 * real microphone or network — the same "pure/testable core, thin real
 * adapter" split `orchestrator.ts`/`execute-vapi-tool-calls.ts` already use.
 */

import type { PendingConfirmation } from '../../../modules/concierge/prepare-tool-result';

export type VoiceCallStatus = 'idle' | 'connecting' | 'active' | 'ended' | 'error';

/** A closed set our UI actually renders distinct copy for — never the raw SDK/Daily error string, which could be arbitrary or embed request detail. */
export type VoiceErrorKind = 'PERMISSION_DENIED' | 'DEVICE_LOST' | 'CONNECTION_FAILED' | 'UNKNOWN';

export interface TranscriptEntry {
  readonly role: 'assistant' | 'user';
  readonly text: string;
}

export interface VoiceCallState {
  readonly status: VoiceCallStatus;
  readonly errorKind: VoiceErrorKind | null;
  readonly speaking: 'assistant' | 'user' | null;
  readonly transcript: readonly TranscriptEntry[];
}

export const INITIAL_VOICE_CALL_STATE: VoiceCallState = {
  status: 'idle',
  errorKind: null,
  speaking: null,
  transcript: [],
};

export type VoiceCallEvent =
  | { readonly type: 'START_REQUESTED' }
  | { readonly type: 'CALL_STARTED' }
  | { readonly type: 'CALL_ENDED' }
  | { readonly type: 'ERROR'; readonly kind: VoiceErrorKind }
  | { readonly type: 'SPEECH_START'; readonly who: 'assistant' | 'user' }
  | { readonly type: 'SPEECH_END'; readonly who: 'assistant' | 'user' }
  | { readonly type: 'TRANSCRIPT'; readonly entry: TranscriptEntry }
  | { readonly type: 'RESET' };

/**
 * Pure reducer. `CALL_ENDED` never overwrites an already-`error` status —
 * Vapi commonly emits `call-end` right after an error (the call really did
 * end), and the error is the more informative thing to keep showing, not a
 * generic "ended."
 */
export function voiceCallReducer(state: VoiceCallState, event: VoiceCallEvent): VoiceCallState {
  switch (event.type) {
    case 'START_REQUESTED':
      return { ...INITIAL_VOICE_CALL_STATE, status: 'connecting' };
    case 'CALL_STARTED':
      return { ...state, status: 'active', errorKind: null };
    case 'CALL_ENDED':
      return state.status === 'error' ? state : { ...state, status: 'ended', speaking: null };
    case 'ERROR':
      return { ...state, status: 'error', errorKind: event.kind, speaking: null };
    case 'SPEECH_START':
      return { ...state, speaking: event.who };
    case 'SPEECH_END':
      return state.speaking === event.who ? { ...state, speaking: null } : state;
    case 'TRANSCRIPT':
      return { ...state, transcript: [...state.transcript, event.entry] };
    case 'RESET':
      return INITIAL_VOICE_CALL_STATE;
    default:
      return state;
  }
}

function extractErrorText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Error) return raw.message;
  if (typeof raw === 'object' && raw !== null) {
    const candidate = raw as {
      message?: unknown;
      error?: unknown;
      name?: unknown;
      errorMsg?: unknown;
    };
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.errorMsg === 'string') return candidate.errorMsg;
    if (typeof candidate.error === 'string') return candidate.error;
    if (typeof candidate.name === 'string') return candidate.name;
  }
  return '';
}

/**
 * Maps an arbitrary raw error (from `@vapi-ai/web`'s `error`/
 * `call-start-failed` events, or a `Call.endedReason` string) to one of our
 * four closed kinds. Pattern-matched on substrings deliberately —
 * `@vapi-ai/web`'s own `endedReason` union includes real values like
 * `"customer-did-not-give-microphone-permission"` this catches via the
 * `permission` match, without this codebase depending on that exact string
 * never changing. Never throws; an unrecognized shape is `UNKNOWN`, not a
 * crash — the UI still has a safe fallback message for that case.
 */
export function classifyVapiError(raw: unknown): VoiceErrorKind {
  const text = extractErrorText(raw).toLowerCase();
  if (/permission|notallowederror|denied/.test(text)) return 'PERMISSION_DENIED';
  if (/device|notfounderror|no microphone|no audio|input device/.test(text)) return 'DEVICE_LOST';
  if (/network|connection|timeout|websocket|unreachable/.test(text)) return 'CONNECTION_FAILED';
  return 'UNKNOWN';
}

/**
 * Guest-facing "duplicate tool" guard for polling `GET /api/vapi/pending-
 * confirmation`: a poll tick that returns the exact same draft already
 * displayed, or one already dismissed/confirmed in this call, must never
 * resurrect/re-render the card. Pure — three independent, individually
 * testable guard clauses.
 */
export function shouldShowPendingConfirmation(
  current: PendingConfirmation | null,
  incoming: PendingConfirmation | null,
  lastHandledToken: string | null,
): boolean {
  if (!incoming) return false;
  if (incoming.confirmationToken === lastHandledToken) return false;
  if (current?.confirmationToken === incoming.confirmationToken) return false;
  return true;
}
