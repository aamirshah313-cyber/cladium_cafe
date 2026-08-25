import { describe, expect, it } from 'vitest';
import {
  checkRequestOrigin,
  isTrustedOrigin,
  parseTrustedOrigins,
  trustedOriginConfig,
} from '../../src/lib/security/origin';

const config = trustedOriginConfig(['https://cladium.example', 'https://staging.cladium.example']);

describe('isTrustedOrigin', () => {
  it('accepts an exact allowlisted origin', () => {
    expect(isTrustedOrigin('https://cladium.example', config)).toBe(true);
  });

  it('rejects a forged/unknown origin', () => {
    expect(isTrustedOrigin('https://evil.example', config)).toBe(false);
  });

  it('rejects a subdomain that was not explicitly allowlisted', () => {
    expect(isTrustedOrigin('https://sub.cladium.example', config)).toBe(false);
  });

  it('rejects a scheme downgrade of an allowlisted host', () => {
    expect(isTrustedOrigin('http://cladium.example', config)).toBe(false);
  });

  it('rejects a null or missing origin', () => {
    expect(isTrustedOrigin(null, config)).toBe(false);
    expect(isTrustedOrigin(undefined, config)).toBe(false);
  });
});

describe('checkRequestOrigin', () => {
  it('trusts a request carrying an allowlisted Origin header', () => {
    expect(checkRequestOrigin({ origin: 'https://cladium.example' }, config)).toEqual({
      trusted: true,
    });
  });

  it('falls back to Referer only when Origin is absent', () => {
    const result = checkRequestOrigin({ referer: 'https://cladium.example/menu?x=1' }, config);
    expect(result).toEqual({ trusted: true });
  });

  it('ignores Referer when Origin is present and untrusted', () => {
    const result = checkRequestOrigin(
      { origin: 'https://evil.example', referer: 'https://cladium.example/menu' },
      config,
    );
    expect(result).toEqual({ trusted: false, reason: 'UNTRUSTED' });
  });

  it('reports MISSING when neither header is present', () => {
    expect(checkRequestOrigin({}, config)).toEqual({ trusted: false, reason: 'MISSING' });
  });

  it('reports UNTRUSTED for a forged origin', () => {
    expect(checkRequestOrigin({ origin: 'https://evil.example' }, config)).toEqual({
      trusted: false,
      reason: 'UNTRUSTED',
    });
  });

  it('never lets a malformed Referer throw', () => {
    expect(checkRequestOrigin({ referer: 'not a url' }, config)).toEqual({
      trusted: false,
      reason: 'MISSING',
    });
  });
});

describe('parseTrustedOrigins', () => {
  it('splits a comma-separated list and drops blanks', () => {
    expect(parseTrustedOrigins('https://a.example, https://b.example,,')).toEqual(
      trustedOriginConfig(['https://a.example', 'https://b.example']),
    );
  });

  it('returns an empty allowlist for an empty string, trusting nothing', () => {
    const empty = parseTrustedOrigins('');
    expect(isTrustedOrigin('https://cladium.example', empty)).toBe(false);
  });
});
