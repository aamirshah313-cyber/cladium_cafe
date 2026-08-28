import { describe, expect, it } from 'vitest';
import {
  createVapiTokenIssuer,
  VAPI_TOKEN_TTL_SECONDS,
} from '../../src/modules/integrations/vapi-client';
import { verifyJwt } from '../../src/lib/security/jwt';
import { validServerEnv } from '../fixtures/env';

const NOW = new Date('2026-08-29T12:00:00Z');
const TRUSTED_ORIGIN = 'https://cladium.example';

describe('createVapiTokenIssuer', () => {
  it('never throws at construction, even with no credentials configured', () => {
    expect(() => createVapiTokenIssuer({})).not.toThrow();
  });

  it('issues a token restricted to the correct assistant id and origin for English', () => {
    const issuer = createVapiTokenIssuer(validServerEnv);
    const issued = issuer.issueToken({ locale: 'en', origin: TRUSTED_ORIGIN, now: NOW });

    expect(issued.assistantId).toBe(validServerEnv.VAPI_ASSISTANT_EN_ID);

    const verified = verifyJwt(issued.token, validServerEnv.VAPI_PRIVATE_KEY, { now: NOW });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.value.orgId).toBe(validServerEnv.VAPI_ORG_ID);
    const claims = verified.value as unknown as {
      token: { tag: string; restrictions: Record<string, unknown> };
    };
    expect(claims.token.tag).toBe('public');
    expect(claims.token.restrictions).toEqual({
      enabled: true,
      allowedAssistantIds: [validServerEnv.VAPI_ASSISTANT_EN_ID],
      allowedOrigins: [TRUSTED_ORIGIN],
      allowTransientAssistant: false,
    });
  });

  it('issues a token restricted to the correct (different) assistant id for Urdu', () => {
    const issuer = createVapiTokenIssuer(validServerEnv);
    const issued = issuer.issueToken({ locale: 'ur', origin: TRUSTED_ORIGIN, now: NOW });

    expect(issued.assistantId).toBe(validServerEnv.VAPI_ASSISTANT_UR_ID);
    expect(issued.assistantId).not.toBe(validServerEnv.VAPI_ASSISTANT_EN_ID);

    const verified = verifyJwt(issued.token, validServerEnv.VAPI_PRIVATE_KEY, { now: NOW });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const claims = verified.value as unknown as {
      token: { restrictions: { allowedAssistantIds: string[] } };
    };
    expect(claims.token.restrictions.allowedAssistantIds).toEqual([
      validServerEnv.VAPI_ASSISTANT_UR_ID,
    ]);
  });

  it("never restricts to both locales' assistant ids at once", () => {
    const issuer = createVapiTokenIssuer(validServerEnv);
    const issued = issuer.issueToken({ locale: 'en', origin: TRUSTED_ORIGIN, now: NOW });
    const verified = verifyJwt(issued.token, validServerEnv.VAPI_PRIVATE_KEY, { now: NOW });
    if (!verified.ok) throw new Error('expected a valid token');
    const claims = verified.value as unknown as {
      token: { restrictions: { allowedAssistantIds: string[] } };
    };
    expect(claims.token.restrictions.allowedAssistantIds).not.toContain(
      validServerEnv.VAPI_ASSISTANT_UR_ID,
    );
  });

  it('expiresAt is exactly VAPI_TOKEN_TTL_SECONDS after issuance', () => {
    const issuer = createVapiTokenIssuer(validServerEnv);
    const issued = issuer.issueToken({ locale: 'en', origin: TRUSTED_ORIGIN, now: NOW });
    const expected = new Date(NOW.getTime() + VAPI_TOKEN_TTL_SECONDS * 1000).toISOString();
    expect(issued.expiresAt).toBe(expected);
  });

  it('a token issued for one origin is rejected by our own verifier for a different origin claim check by the caller (the origin restriction is data Vapi enforces, not this module)', () => {
    // This module only ever embeds the caller-supplied origin; it is the
    // caller's job (the route + Step 20's origin guard) to ensure that
    // value is trusted before it ever reaches here.
    const issuer = createVapiTokenIssuer(validServerEnv);
    const issued = issuer.issueToken({
      locale: 'en',
      origin: 'https://not-cladium.example',
      now: NOW,
    });
    const verified = verifyJwt(issued.token, validServerEnv.VAPI_PRIVATE_KEY, { now: NOW });
    if (!verified.ok) throw new Error('expected a valid token');
    const claims = verified.value as unknown as {
      token: { restrictions: { allowedOrigins: string[] } };
    };
    expect(claims.token.restrictions.allowedOrigins).toEqual(['https://not-cladium.example']);
  });

  it('issueToken throws when Vapi credentials are not configured — never silently issues an unrestricted/unsigned token', () => {
    const issuer = createVapiTokenIssuer({});
    expect(() => issuer.issueToken({ locale: 'en', origin: TRUSTED_ORIGIN, now: NOW })).toThrow();
  });

  it("a token issued with one org's private key does not verify against a different secret", () => {
    const issuer = createVapiTokenIssuer(validServerEnv);
    const issued = issuer.issueToken({ locale: 'en', origin: TRUSTED_ORIGIN, now: NOW });
    const verified = verifyJwt(issued.token, 'wrong-secret', { now: NOW });
    expect(verified.ok).toBe(false);
  });

  it('the issued response (what the API route sends to the browser) never contains the private signing key', () => {
    const issuer = createVapiTokenIssuer(validServerEnv);
    const issued = issuer.issueToken({ locale: 'en', origin: TRUSTED_ORIGIN, now: NOW });
    const serialized = JSON.stringify(issued);
    expect(serialized).not.toContain(validServerEnv.VAPI_PRIVATE_KEY);
    // orgId is embedded inside the signed JWT payload (Vapi needs it to
    // scope the call) but must never appear as a separate plain field.
    expect(Object.keys(issued)).toEqual(['token', 'assistantId', 'expiresAt']);
  });
});
