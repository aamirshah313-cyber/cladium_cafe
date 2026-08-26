import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerOnlyViolationError, assertServerOnly, isBrowser } from '../../src/lib/server-only';
import * as clientEnvModule from '../../src/lib/env';
import { validClientEnv, validServerEnv } from '../fixtures/env';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('server-only guard', () => {
  it('does not throw in a server (non-browser) environment', () => {
    expect(isBrowser()).toBe(false);
    expect(() => assertServerOnly('test-module')).not.toThrow();
  });

  it('throws when a browser global is present', () => {
    vi.stubGlobal('window', {});
    expect(isBrowser()).toBe(true);
    expect(() => assertServerOnly('test-module')).toThrow(ServerOnlyViolationError);
  });

  it('names the offending module in the error, to make the fix obvious', () => {
    vi.stubGlobal('window', {});
    expect(() => assertServerOnly('src/lib/secret-thing.ts')).toThrow(/src\/lib\/secret-thing\.ts/);
  });
});

describe('env module separation', () => {
  it('the client module exports no server schema symbols at all', () => {
    const exported = Object.keys(clientEnvModule).sort();
    expect(exported).toEqual(['clientEnvSchema', 'parseAppUrl', 'parseClientEnv']);

    for (const forbidden of [
      'serverEnvSchema',
      'parseServerEnv',
      'featureFlagSchema',
      'parseFeatureFlags',
      'isFeatureEnabled',
    ]) {
      expect(exported).not.toContain(forbidden);
    }
  });

  it('the client module source names no server-only variable', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../../src/lib/env.ts', import.meta.url), 'utf8');

    for (const serverKey of Object.keys(validServerEnv)) {
      expect(source).not.toContain(serverKey);
    }
    // Every SCREAMING_SNAKE_CASE token (i.e. env-var-shaped) must be public.
    for (const match of source.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) {
      expect(match[0].startsWith('NEXT_PUBLIC_')).toBe(true);
    }
  });

  it('importing the server env module in a browser throws at module load', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {});

    // Asserted by name/message rather than `instanceof`: resetModules gives the
    // dynamic import its own module instance, so the thrown class is a
    // different identity from the statically imported one.
    await expect(import('../../src/lib/env.server')).rejects.toThrow(/is server-only/);

    let caught: unknown;
    try {
      await import('../../src/lib/env.server');
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).name).toBe('ServerOnlyViolationError');
    expect((caught as Error).message).toContain('src/lib/env.server.ts');
  });

  it('importing the server env module on the server succeeds', async () => {
    vi.resetModules();
    const mod = await import('../../src/lib/env.server');
    expect(typeof mod.parseServerEnv).toBe('function');
  });

  it('the client parser still runs in a browser — public values belong there', () => {
    vi.stubGlobal('window', {});
    expect(() => clientEnvModule.parseClientEnv(validClientEnv)).not.toThrow();
  });

  it('never returns a server value from the client parser, even if present in the source', () => {
    const polluted = { ...validClientEnv, ...validServerEnv };
    const parsed = clientEnvModule.parseClientEnv(polluted) as Record<string, unknown>;

    expect(Object.keys(parsed).every((key) => key.startsWith('NEXT_PUBLIC_'))).toBe(true);
    expect(parsed.ANTHROPIC_API_KEY).toBeUndefined();
    expect(parsed.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('test-anthropic-key');
  });
});
