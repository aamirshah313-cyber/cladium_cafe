import { describe, expect, it } from 'vitest';
import { createSessionToken } from '../../src/lib/security/session';
import { resolveCustomerSession } from '../../src/lib/customer-session';

const SECRET = 'test-secret-value-at-least-32-bytes-long';
const NOW = new Date('2026-08-26T12:00:00Z');

describe('resolveCustomerSession', () => {
  it('mints a fresh session and a Set-Cookie header when there is no existing token', () => {
    const result = resolveCustomerSession({
      existingToken: undefined,
      secret: SECRET,
      secure: true,
      now: NOW,
    });
    expect(result.isNew).toBe(true);
    expect(typeof result.sessionId).toBe('string');
    expect(result.setCookieHeader).toContain('HttpOnly');
  });

  it('reuses the session id from a valid existing token, with no Set-Cookie header', () => {
    const token = createSessionToken(SECRET, { sessionId: 'session-abc', now: NOW });
    const result = resolveCustomerSession({
      existingToken: token,
      secret: SECRET,
      secure: true,
      now: NOW,
    });
    expect(result).toEqual({ sessionId: 'session-abc', isNew: false, setCookieHeader: null });
  });

  it('mints a fresh session when the existing token is malformed', () => {
    const result = resolveCustomerSession({
      existingToken: 'not-a-real-token',
      secret: SECRET,
      secure: true,
      now: NOW,
    });
    expect(result.isNew).toBe(true);
  });

  it('mints a fresh session when the existing token was signed with a different secret', () => {
    const token = createSessionToken('a-completely-different-secret-value', {
      sessionId: 'session-abc',
      now: NOW,
    });
    const result = resolveCustomerSession({
      existingToken: token,
      secret: SECRET,
      secure: true,
      now: NOW,
    });
    expect(result.isNew).toBe(true);
    expect(result.sessionId).not.toBe('session-abc');
  });

  it('mints a fresh session when the existing token has expired', () => {
    const token = createSessionToken(SECRET, {
      sessionId: 'session-abc',
      now: NOW,
      ttlSeconds: 60,
    });
    const later = new Date(NOW.getTime() + 120_000);
    const result = resolveCustomerSession({
      existingToken: token,
      secret: SECRET,
      secure: true,
      now: later,
    });
    expect(result.isNew).toBe(true);
  });

  it('omits Secure on an insecure (local development) request', () => {
    const result = resolveCustomerSession({
      existingToken: undefined,
      secret: SECRET,
      secure: false,
      now: NOW,
    });
    expect(result.setCookieHeader).not.toContain('Secure');
  });
});
