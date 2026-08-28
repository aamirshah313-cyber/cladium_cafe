import { describe, expect, it } from 'vitest';
import {
  INITIAL_VOICE_CALL_STATE,
  classifyVapiError,
  shouldShowPendingConfirmation,
  voiceCallReducer,
  type VoiceCallState,
} from '../../src/app/[locale]/concierge/voice-call-state';
import type { PendingConfirmation } from '../../src/modules/concierge/prepare-tool-result';

describe('voiceCallReducer', () => {
  it('starts idle', () => {
    expect(INITIAL_VOICE_CALL_STATE.status).toBe('idle');
  });

  it('START_REQUESTED resets to connecting, clearing any prior transcript/error', () => {
    const dirty: VoiceCallState = {
      status: 'error',
      errorKind: 'UNKNOWN',
      speaking: 'assistant',
      transcript: [{ role: 'user', text: 'hello' }],
    };
    const next = voiceCallReducer(dirty, { type: 'START_REQUESTED' });
    expect(next).toEqual({ status: 'connecting', errorKind: null, speaking: null, transcript: [] });
  });

  it('CALL_STARTED moves connecting -> active and clears a stale error kind', () => {
    const state: VoiceCallState = {
      ...INITIAL_VOICE_CALL_STATE,
      status: 'connecting',
      errorKind: 'DEVICE_LOST',
    };
    const next = voiceCallReducer(state, { type: 'CALL_STARTED' });
    expect(next.status).toBe('active');
    expect(next.errorKind).toBeNull();
  });

  it('CALL_ENDED moves active -> ended', () => {
    const state: VoiceCallState = {
      ...INITIAL_VOICE_CALL_STATE,
      status: 'active',
      speaking: 'user',
    };
    const next = voiceCallReducer(state, { type: 'CALL_ENDED' });
    expect(next.status).toBe('ended');
    expect(next.speaking).toBeNull();
  });

  it('CALL_ENDED never overwrites an existing error status — the error stays the more informative state', () => {
    const state: VoiceCallState = {
      ...INITIAL_VOICE_CALL_STATE,
      status: 'error',
      errorKind: 'CONNECTION_FAILED',
    };
    const next = voiceCallReducer(state, { type: 'CALL_ENDED' });
    expect(next.status).toBe('error');
    expect(next.errorKind).toBe('CONNECTION_FAILED');
  });

  it('ERROR sets status and errorKind and clears speaking, from any prior state', () => {
    const state: VoiceCallState = {
      ...INITIAL_VOICE_CALL_STATE,
      status: 'active',
      speaking: 'assistant',
    };
    const next = voiceCallReducer(state, { type: 'ERROR', kind: 'PERMISSION_DENIED' });
    expect(next.status).toBe('error');
    expect(next.errorKind).toBe('PERMISSION_DENIED');
    expect(next.speaking).toBeNull();
  });

  it('SPEECH_START/SPEECH_END track who is currently speaking', () => {
    let state = voiceCallReducer(INITIAL_VOICE_CALL_STATE, {
      type: 'SPEECH_START',
      who: 'assistant',
    });
    expect(state.speaking).toBe('assistant');
    state = voiceCallReducer(state, { type: 'SPEECH_END', who: 'assistant' });
    expect(state.speaking).toBeNull();
  });

  it('SPEECH_END for a different speaker than currently tracked is a no-op (stale event)', () => {
    const state: VoiceCallState = { ...INITIAL_VOICE_CALL_STATE, speaking: 'user' };
    const next = voiceCallReducer(state, { type: 'SPEECH_END', who: 'assistant' });
    expect(next.speaking).toBe('user');
  });

  it('TRANSCRIPT appends without mutating the prior array', () => {
    const state: VoiceCallState = {
      ...INITIAL_VOICE_CALL_STATE,
      transcript: [{ role: 'user', text: 'hi' }],
    };
    const next = voiceCallReducer(state, {
      type: 'TRANSCRIPT',
      entry: { role: 'assistant', text: 'hello!' },
    });
    expect(next.transcript).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello!' },
    ]);
    expect(state.transcript).toHaveLength(1); // original untouched
  });

  it('RESET returns to the exact initial state from anywhere', () => {
    const state: VoiceCallState = {
      status: 'error',
      errorKind: 'UNKNOWN',
      speaking: 'user',
      transcript: [{ role: 'user', text: 'x' }],
    };
    expect(voiceCallReducer(state, { type: 'RESET' })).toEqual(INITIAL_VOICE_CALL_STATE);
  });
});

describe('classifyVapiError', () => {
  it('classifies a DOM permission-denial error', () => {
    expect(classifyVapiError({ name: 'NotAllowedError', message: 'Permission denied' })).toBe(
      'PERMISSION_DENIED',
    );
  });

  it("classifies Vapi's real endedReason string for a declined microphone prompt", () => {
    expect(classifyVapiError('customer-did-not-give-microphone-permission')).toBe(
      'PERMISSION_DENIED',
    );
  });

  it('classifies a missing/lost input device error', () => {
    expect(
      classifyVapiError({ name: 'NotFoundError', message: 'Requested device not found' }),
    ).toBe('DEVICE_LOST');
  });

  it('classifies a network/connection failure', () => {
    expect(classifyVapiError({ message: 'WebSocket connection failed' })).toBe('CONNECTION_FAILED');
  });

  it('classifies an unrecognized error shape as UNKNOWN, never throwing', () => {
    expect(classifyVapiError({ somethingElse: true })).toBe('UNKNOWN');
    expect(classifyVapiError(null)).toBe('UNKNOWN');
    expect(classifyVapiError(undefined)).toBe('UNKNOWN');
    expect(classifyVapiError(42)).toBe('UNKNOWN');
  });

  it('accepts a plain Error instance', () => {
    expect(classifyVapiError(new Error('permission was denied by the user'))).toBe(
      'PERMISSION_DENIED',
    );
  });
});

describe('shouldShowPendingConfirmation — duplicate-tool poll guard', () => {
  const DRAFT: PendingConfirmation = { kind: 'BOOKING', review: {}, confirmationToken: 'tok-1' };
  const OTHER_DRAFT: PendingConfirmation = {
    kind: 'EVENT',
    review: {},
    confirmationToken: 'tok-2',
  };

  it('shows a genuinely new draft when nothing is currently shown', () => {
    expect(shouldShowPendingConfirmation(null, DRAFT, null)).toBe(true);
  });

  it('does not show when nothing has arrived from the poll', () => {
    expect(shouldShowPendingConfirmation(null, null, null)).toBe(false);
  });

  it('does not re-show the exact same draft already displayed (duplicate poll tick)', () => {
    expect(shouldShowPendingConfirmation(DRAFT, DRAFT, null)).toBe(false);
  });

  it('does not resurrect a draft the guest already confirmed or dismissed', () => {
    expect(shouldShowPendingConfirmation(null, DRAFT, DRAFT.confirmationToken)).toBe(false);
  });

  it('shows a genuinely new draft even while a different one was already handled', () => {
    expect(shouldShowPendingConfirmation(null, OTHER_DRAFT, DRAFT.confirmationToken)).toBe(true);
  });

  it('shows a new draft that replaces one currently displayed', () => {
    expect(shouldShowPendingConfirmation(DRAFT, OTHER_DRAFT, null)).toBe(true);
  });
});
