import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken } from '../../src/lib/security/session';
import { createCsrfToken } from '../../src/lib/security/csrf';
import { guardStateChangingRequest, resolveSessionContext } from '../../src/lib/http/session-route';

const SECRET = 'test-secret-value-at-least-32-bytes-long';
const APP_URL = 'https://cladium.example';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('resolveSessionContext', () => {
  it('mints a session and a matching CSRF token when there is no cookie', () => {
    const result = resolveSessionContext({ headers: {}, secure: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.setCookieHeader).toContain('HttpOnly');
      expect(result.value.csrfToken).toBe(createCsrfToken(result.value.sessionId, SECRET));
    }
  });

  it('reuses an existing valid session cookie with no Set-Cookie header', () => {
    const token = createSessionToken(SECRET, { sessionId: 'session-abc' });
    const result = resolveSessionContext({
      headers: { cookie: `cladium_session=${token}` },
      secure: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionId).toBe('session-abc');
      expect(result.value.setCookieHeader).toBeNull();
    }
  });

  it('fails when SESSION_SECRET is not configured', () => {
    delete process.env.SESSION_SECRET;
    const result = resolveSessionContext({ headers: {}, secure: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('guardStateChangingRequest', () => {
  it('allows a GET with no CSRF token at all', () => {
    const result = guardStateChangingRequest({ method: 'GET', sessionId: 'session-abc' });
    expect(result.ok).toBe(true);
  });

  it('allows a POST with a matching origin and valid CSRF token', () => {
    const csrfToken = createCsrfToken('session-abc', SECRET);
    const result = guardStateChangingRequest({
      method: 'POST',
      origin: APP_URL,
      sessionId: 'session-abc',
      csrfToken,
    });
    expect(result.ok).toBe(true);
  });

  it('forbids a POST with an untrusted origin', () => {
    const csrfToken = createCsrfToken('session-abc', SECRET);
    const result = guardStateChangingRequest({
      method: 'POST',
      origin: 'https://evil.example',
      sessionId: 'session-abc',
      csrfToken,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('forbids a POST with a missing CSRF token', () => {
    const result = guardStateChangingRequest({
      method: 'POST',
      origin: APP_URL,
      sessionId: 'session-abc',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('forbids a POST with a CSRF token issued for a different session', () => {
    const csrfToken = createCsrfToken('session-OTHER', SECRET);
    const result = guardStateChangingRequest({
      method: 'POST',
      origin: APP_URL,
      sessionId: 'session-abc',
      csrfToken,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('fails closed when NEXT_PUBLIC_APP_URL is not configured, rather than skipping the check', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const csrfToken = createCsrfToken('session-abc', SECRET);
    const result = guardStateChangingRequest({
      method: 'POST',
      origin: APP_URL,
      sessionId: 'session-abc',
      csrfToken,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});
