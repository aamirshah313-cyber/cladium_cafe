import { describe, expect, it } from 'vitest';
import { verifyCronAuthHeader } from '../../src/lib/security/cron-auth';

const SECRET = 'a-cron-secret-value';

describe('verifyCronAuthHeader', () => {
  it('accepts a correctly formed bearer header matching the secret', () => {
    expect(verifyCronAuthHeader(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it('rejects a mismatched token', () => {
    expect(verifyCronAuthHeader('Bearer wrong-token', SECRET)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyCronAuthHeader(null, SECRET)).toBe(false);
    expect(verifyCronAuthHeader(undefined, SECRET)).toBe(false);
  });

  it('rejects a header without the Bearer prefix', () => {
    expect(verifyCronAuthHeader(SECRET, SECRET)).toBe(false);
  });

  it('fails closed when the secret itself is unconfigured — never accepts anything', () => {
    expect(verifyCronAuthHeader(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(verifyCronAuthHeader(`Bearer ${SECRET}`, '')).toBe(false);
  });

  it('rejects a token that is a prefix of the real secret (no accidental partial match)', () => {
    expect(verifyCronAuthHeader(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
  });
});
