import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingMfaCookie,
  issuePendingMfaCookie,
  resolvePendingMfaState,
} from '../../src/modules/staff/mfa-session';

const SECRET = 'test-secret-value-at-least-32-bytes-long';
const FIXED_NOW = new Date('2026-08-31T12:00:00.000Z');
const SESSION = { accessToken: 'access-1', refreshToken: 'refresh-1', userId: 'user-1' };

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function cookieHeaderFor(cookie: string) {
  return cookie.split(';')[0] as string;
}

describe('issuePendingMfaCookie / resolvePendingMfaState', () => {
  it('round-trips a SIGN_IN_CHALLENGE state, including factorId/challengeId', () => {
    const cookie = issuePendingMfaCookie(
      {
        purpose: 'SIGN_IN_CHALLENGE',
        session: SESSION,
        factorId: 'factor-1',
        challengeId: 'challenge-1',
      },
      { secure: true, now: FIXED_NOW },
    );
    const resolved = resolvePendingMfaState(
      { cookie: cookieHeaderFor(cookie) },
      { secure: true, now: FIXED_NOW },
    );
    expect(resolved).toEqual({
      purpose: 'SIGN_IN_CHALLENGE',
      session: SESSION,
      factorId: 'factor-1',
      challengeId: 'challenge-1',
    });
  });

  it('round-trips an ENROLL_WINDOW state with no factorId/challengeId', () => {
    const cookie = issuePendingMfaCookie(
      { purpose: 'ENROLL_WINDOW', session: SESSION },
      { secure: true, now: FIXED_NOW },
    );
    const resolved = resolvePendingMfaState(
      { cookie: cookieHeaderFor(cookie) },
      { secure: true, now: FIXED_NOW },
    );
    expect(resolved).toEqual({
      purpose: 'ENROLL_WINDOW',
      session: SESSION,
      factorId: undefined,
      challengeId: undefined,
    });
  });

  it('uses a distinct cookie name from both the guest and staff sessions', () => {
    const cookie = issuePendingMfaCookie(
      { purpose: 'ENROLL_WINDOW', session: SESSION },
      { secure: true, now: FIXED_NOW },
    );
    expect(cookie).toContain('__Host-cladium_staff_mfa_pending=');
    expect(cookie).not.toContain('__Host-cladium_staff_session=');
    expect(cookie).not.toContain('__Host-cladium_session=');
  });

  it('sets a 5-minute Max-Age', () => {
    const cookie = issuePendingMfaCookie(
      { purpose: 'ENROLL_WINDOW', session: SESSION },
      { secure: true, now: FIXED_NOW },
    );
    expect(cookie).toContain(`Max-Age=${5 * 60}`);
  });

  it('returns null for a missing cookie', () => {
    expect(resolvePendingMfaState({}, { secure: true, now: FIXED_NOW })).toBeNull();
  });

  it('returns null for an expired cookie', () => {
    const cookie = issuePendingMfaCookie(
      { purpose: 'ENROLL_WINDOW', session: SESSION },
      { secure: true, now: FIXED_NOW },
    );
    const later = new Date(FIXED_NOW.getTime() + 6 * 60_000);
    const resolved = resolvePendingMfaState(
      { cookie: cookieHeaderFor(cookie) },
      { secure: true, now: later },
    );
    expect(resolved).toBeNull();
  });

  it('returns null for a tampered/forged token', () => {
    const cookie = issuePendingMfaCookie(
      { purpose: 'ENROLL_WINDOW', session: SESSION },
      { secure: true, now: FIXED_NOW },
    );
    const tampered = cookieHeaderFor(cookie).replace(/.$/, 'x');
    expect(
      resolvePendingMfaState({ cookie: tampered }, { secure: true, now: FIXED_NOW }),
    ).toBeNull();
  });
});

describe('clearPendingMfaCookie', () => {
  it('clears the same cookie name issuePendingMfaCookie sets, with Max-Age=0', () => {
    const cookie = clearPendingMfaCookie({ secure: true });
    expect(cookie).toContain('__Host-cladium_staff_mfa_pending=;');
    expect(cookie).toContain('Max-Age=0');
  });
});
