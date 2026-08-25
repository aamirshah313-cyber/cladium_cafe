import { describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  createSessionToken,
  readSessionToken,
  serializeSessionCookie,
  sessionCookieName,
  verifySessionToken,
} from '../../src/lib/security/session';

const SECRET = 'x'.repeat(32);
const OTHER_SECRET = 'y'.repeat(32);
const FIXED_NOW = new Date('2026-08-24T12:00:00.000Z');

describe('createSessionToken / verifySessionToken', () => {
  it('round-trips a freshly issued token', () => {
    const token = createSessionToken(SECRET, { sessionId: 'session-1', now: FIXED_NOW });
    const result = verifySessionToken(token, SECRET, { now: FIXED_NOW });
    const issuedAt = Math.floor(FIXED_NOW.getTime() / 1000);
    expect(result).toEqual({
      ok: true,
      value: { sessionId: 'session-1', issuedAt, expiresAt: issuedAt + 60 * 60 * 24 * 7 },
    });
  });

  it('rejects a token signed with a different secret (bad signature)', () => {
    const token = createSessionToken(SECRET, { sessionId: 'session-1', now: FIXED_NOW });
    const result = verifySessionToken(token, OTHER_SECRET, { now: FIXED_NOW });
    expect(result).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('rejects a tampered payload even if the signature format still parses', () => {
    const token = createSessionToken(SECRET, { sessionId: 'session-1', now: FIXED_NOW });
    const [, signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sessionId: 'admin', issuedAt: 0, expiresAt: 0 }),
    ).toString('base64url');
    const forged = `${forgedPayload}.${signature}`;
    expect(verifySessionToken(forged, SECRET, { now: FIXED_NOW })).toEqual({
      ok: false,
      error: 'BAD_SIGNATURE',
    });
  });

  it('rejects an expired token', () => {
    const token = createSessionToken(SECRET, {
      sessionId: 'session-1',
      now: FIXED_NOW,
      ttlSeconds: 60,
    });
    const later = new Date(FIXED_NOW.getTime() + 61_000);
    expect(verifySessionToken(token, SECRET, { now: later })).toEqual({
      ok: false,
      error: 'EXPIRED',
    });
  });

  it('rejects a malformed token', () => {
    expect(verifySessionToken('not-a-token', SECRET)).toEqual({ ok: false, error: 'MALFORMED' });
    expect(verifySessionToken('', SECRET)).toEqual({ ok: false, error: 'MALFORMED' });
    expect(verifySessionToken('.nopayload', SECRET)).toEqual({ ok: false, error: 'MALFORMED' });
  });

  it('generates a random session ID when none is supplied', () => {
    const tokenA = createSessionToken(SECRET, { now: FIXED_NOW });
    const tokenB = createSessionToken(SECRET, { now: FIXED_NOW });
    expect(tokenA).not.toBe(tokenB);
  });
});

describe('serializeSessionCookie / clearSessionCookie', () => {
  it('is secure, HttpOnly, SameSite=Lax, and uses the __Host- prefix by default', () => {
    const cookie = serializeSessionCookie('token-value', { maxAgeSeconds: 3600 });
    expect(cookie).toContain('__Host-cladium_session=token-value');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('uses a plain cookie name when explicitly marked insecure for local development', () => {
    const cookie = serializeSessionCookie('token-value', { secure: false });
    expect(cookie).toContain('cladium_session=token-value');
    expect(cookie).not.toContain('__Host-');
    expect(cookie).not.toContain('Secure');
  });

  it('clears the cookie with Max-Age=0', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
    expect(clearSessionCookie()).toContain(sessionCookieName(true));
  });
});

describe('readSessionToken', () => {
  it('extracts the token from a Cookie header (object form)', () => {
    const token = readSessionToken({ cookie: `${sessionCookieName(true)}=abc123; other=1` });
    expect(token).toBe('abc123');
  });

  it('extracts the token from a Headers instance', () => {
    const headers = new Headers({ cookie: `other=1; ${sessionCookieName(true)}=abc123` });
    expect(readSessionToken(headers)).toBe('abc123');
  });

  it('returns undefined when the cookie is absent', () => {
    expect(readSessionToken({ cookie: 'other=1' })).toBeUndefined();
    expect(readSessionToken(undefined)).toBeUndefined();
  });

  it('reads the insecure cookie name only when explicitly asked', () => {
    const headers = { cookie: `${sessionCookieName(false)}=abc123` };
    expect(readSessionToken(headers, { secure: false })).toBe('abc123');
    expect(readSessionToken(headers, { secure: true })).toBeUndefined();
  });
});
