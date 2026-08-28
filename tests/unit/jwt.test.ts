import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from '../../src/lib/security/jwt';

const SECRET = 'test-jwt-secret';
const NOW = new Date('2026-08-29T12:00:00Z');

describe('signJwt / verifyJwt', () => {
  it('produces a three-part compact JWT', () => {
    const { token } = signJwt({ hello: 'world' }, SECRET, { ttlSeconds: 60, now: NOW });
    expect(token.split('.')).toHaveLength(3);
  });

  it('round-trips claims, and computed iat/exp are correct', () => {
    const { token, issuedAt, expiresAt } = signJwt({ hello: 'world' }, SECRET, {
      ttlSeconds: 60,
      now: NOW,
    });
    expect(issuedAt).toBe(Math.floor(NOW.getTime() / 1000));
    expect(expiresAt).toBe(issuedAt + 60);

    const verified = verifyJwt(token, SECRET, { now: NOW });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.value.hello).toBe('world');
      expect(verified.value.iat).toBe(issuedAt);
      expect(verified.value.exp).toBe(expiresAt);
    }
  });

  it('caller-supplied iat/exp claims are overridden by the computed values, never leaked through', () => {
    const { issuedAt, expiresAt } = signJwt({ iat: 1, exp: 2 }, SECRET, {
      ttlSeconds: 60,
      now: NOW,
    });
    expect(issuedAt).toBe(Math.floor(NOW.getTime() / 1000));
    expect(expiresAt).not.toBe(2);
  });

  it('rejects a token with a tampered payload segment', () => {
    const { token } = signJwt({ role: 'guest' }, SECRET, { ttlSeconds: 60, now: NOW });
    const [header, , signature] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ role: 'admin', iat: 0, exp: 9999999999 }),
      'utf8',
    ).toString('base64url');
    const tampered = `${header}.${tamperedPayload}.${signature}`;

    const verified = verifyJwt(tampered, SECRET, { now: NOW });
    expect(verified).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = signJwt({ role: 'guest' }, SECRET, { ttlSeconds: 60, now: NOW });
    const verified = verifyJwt(token, 'a-different-secret', { now: NOW });
    expect(verified).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('rejects an expired token', () => {
    const { token, expiresAt } = signJwt({ role: 'guest' }, SECRET, { ttlSeconds: 60, now: NOW });
    const afterExpiry = new Date((expiresAt + 1) * 1000);
    const verified = verifyJwt(token, SECRET, { now: afterExpiry });
    expect(verified).toEqual({ ok: false, error: 'EXPIRED' });
  });

  it('accepts a token at the exact expiry boundary as already expired (>=, never >)', () => {
    const { token, expiresAt } = signJwt({ role: 'guest' }, SECRET, { ttlSeconds: 60, now: NOW });
    const atExpiry = new Date(expiresAt * 1000);
    const verified = verifyJwt(token, SECRET, { now: atExpiry });
    expect(verified).toEqual({ ok: false, error: 'EXPIRED' });
  });

  it('rejects a malformed token (wrong segment count)', () => {
    expect(verifyJwt('only.two', SECRET)).toEqual({ ok: false, error: 'MALFORMED' });
    expect(verifyJwt('', SECRET)).toEqual({ ok: false, error: 'MALFORMED' });
  });

  it('rejects a token whose payload segment is not valid base64url JSON', () => {
    const { token } = signJwt({ role: 'guest' }, SECRET, { ttlSeconds: 60, now: NOW });
    const [header] = token.split('.');
    const malformedPayload = Buffer.from('not-json', 'utf8').toString('base64url');
    // Signature must match the tampered payload, or BAD_SIGNATURE would fire
    // first — sign fresh over the malformed payload to isolate the
    // malformed-JSON branch specifically.
    const validSig = createHmac('sha256', SECRET)
      .update(`${header}.${malformedPayload}`)
      .digest('base64url');
    const verified = verifyJwt(`${header}.${malformedPayload}.${validSig}`, SECRET, { now: NOW });
    expect(verified).toEqual({ ok: false, error: 'MALFORMED' });
  });
});
