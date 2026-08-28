import { describe, expect, it } from 'vitest';
import {
  VAPI_TOKEN_RATE_LIMIT_RULE,
  issueVapiToken,
  type IssueVapiTokenDeps,
} from '../../src/modules/voice/token/issue-vapi-token';
import { createInMemoryRateLimiter } from '../../src/lib/security/rate-limit';
import type { Logger } from '../../src/lib/logging';
import type { IssuedVapiToken, VapiTokenIssuer } from '../../src/modules/integrations/vapi-client';
import { launchFeatureFlags } from '../fixtures/env';

const NOW = new Date('2026-08-29T12:00:00Z');

function fakeLogger(): Logger & {
  readonly calls: { level: string; event: string; fields?: Record<string, unknown> }[];
} {
  const calls: { level: string; event: string; fields?: Record<string, unknown> }[] = [];
  const base = {
    calls,
    debug: (event: string, fields?: Record<string, unknown>) =>
      calls.push({ level: 'debug', event, fields }),
    info: (event: string, fields?: Record<string, unknown>) =>
      calls.push({ level: 'info', event, fields }),
    warn: (event: string, fields?: Record<string, unknown>) =>
      calls.push({ level: 'warn', event, fields }),
    error: (event: string, fields?: Record<string, unknown>) =>
      calls.push({ level: 'error', event, fields }),
    logAppError: () => {},
  };
  return { ...base, withCorrelationId: () => fakeLogger() } as unknown as Logger & {
    calls: typeof calls;
  };
}

function fakeIssuer(
  result: IssuedVapiToken | Error,
): VapiTokenIssuer & { readonly calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    issueToken(input) {
      calls.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const SUCCESSFUL_TOKEN: IssuedVapiToken = {
  token: 'header.payload.signature',
  assistantId: 'test-assistant-en',
  expiresAt: '2026-08-29T12:02:00.000Z',
};

function buildDeps(overrides: Partial<IssueVapiTokenDeps> = {}): IssueVapiTokenDeps {
  return {
    issuer: fakeIssuer(SUCCESSFUL_TOKEN),
    rateLimiter: createInMemoryRateLimiter(),
    logger: fakeLogger(),
    now: () => NOW,
    envSource: { ...launchFeatureFlags, FEATURE_VOICE_EN: 'true', FEATURE_VOICE_UR: 'true' },
    ...overrides,
  };
}

describe('issueVapiToken', () => {
  it('returns the issued token when the flag is on and under the rate limit', async () => {
    const deps = buildDeps();
    const result = await issueVapiToken(deps, {
      sessionId: 'session-1',
      locale: 'en',
      origin: 'https://cladium.example',
      correlationId: 'corr-1',
    });
    expect(result).toEqual({ ok: true, value: { ...SUCCESSFUL_TOKEN, sessionId: 'session-1' } });
  });

  it("echoes back the caller's own sessionId — needed client-side since the session cookie is HttpOnly", async () => {
    const deps = buildDeps();
    const result = await issueVapiToken(deps, {
      sessionId: 'session-xyz',
      locale: 'en',
      origin: 'https://cladium.example',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sessionId).toBe('session-xyz');
  });

  it("rejects with FEATURE_DISABLED when the requested locale's flag is off, without calling the issuer", async () => {
    const issuer = fakeIssuer(SUCCESSFUL_TOKEN);
    const deps = buildDeps({ issuer, envSource: launchFeatureFlags }); // both voice flags false
    const result = await issueVapiToken(deps, {
      sessionId: 'session-1',
      locale: 'en',
      origin: 'https://cladium.example',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FEATURE_DISABLED');
    expect(issuer.calls).toHaveLength(0);
  });

  it("checks the correct locale's flag independently — English on does not unlock Urdu", async () => {
    const deps = buildDeps({
      envSource: { ...launchFeatureFlags, FEATURE_VOICE_EN: 'true', FEATURE_VOICE_UR: 'false' },
    });
    const result = await issueVapiToken(deps, {
      sessionId: 'session-1',
      locale: 'ur',
      origin: 'https://cladium.example',
      correlationId: 'corr-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FEATURE_DISABLED');
  });

  it('rejects with RATE_LIMITED once the per-session rate limit is exceeded', async () => {
    const deps = buildDeps();
    const input = {
      sessionId: 'session-rate-limited',
      locale: 'en' as const,
      origin: 'https://cladium.example',
      correlationId: 'corr-1',
    };

    for (let i = 0; i < VAPI_TOKEN_RATE_LIMIT_RULE.max; i += 1) {
      const ok = await issueVapiToken(deps, input);
      expect(ok.ok).toBe(true);
    }

    const blocked = await issueVapiToken(deps, input);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('RATE_LIMITED');
  });

  it('rate limits are scoped per session — a different session is unaffected', async () => {
    const deps = buildDeps();
    const first = {
      sessionId: 'session-a',
      locale: 'en' as const,
      origin: 'https://cladium.example',
      correlationId: 'c1',
    };
    const second = {
      sessionId: 'session-b',
      locale: 'en' as const,
      origin: 'https://cladium.example',
      correlationId: 'c2',
    };

    for (let i = 0; i < VAPI_TOKEN_RATE_LIMIT_RULE.max; i += 1) {
      await issueVapiToken(deps, first);
    }
    const firstBlocked = await issueVapiToken(deps, first);
    expect(firstBlocked.ok).toBe(false);

    const secondAllowed = await issueVapiToken(deps, second);
    expect(secondAllowed.ok).toBe(true);
  });

  it('returns a safe INTERNAL error and logs only a type name, never the raw error, when the issuer throws', async () => {
    const thrown = new Error(
      'VAPI_PRIVATE_KEY is not configured — contains no secret, but treat as sensitive',
    );
    const logger = fakeLogger();
    const deps = buildDeps({ issuer: fakeIssuer(thrown), logger });

    const result = await issueVapiToken(deps, {
      sessionId: 'session-1',
      locale: 'en',
      origin: 'https://cladium.example',
      correlationId: 'corr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.message).not.toContain('VAPI_PRIVATE_KEY');
    }

    const errorLog = logger.calls.find((c) => c.level === 'error');
    expect(errorLog).toBeDefined();
    expect(JSON.stringify(errorLog)).not.toContain('VAPI_PRIVATE_KEY is not configured');
    expect(errorLog?.fields?.errorType).toBe('Error');
  });
});
