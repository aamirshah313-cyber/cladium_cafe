import { describe, expect, it, vi } from 'vitest';
import {
  DurableStorageUnavailableError,
  inMemoryStoresAllowed,
  resolveDurableDeps,
} from '../../src/lib/db/durable-storage-policy';

/**
 * The behaviour this file protects is the *default*, not the opt-in.
 *
 * The pattern this replaces caught any construction failure and silently
 * returned an in-memory store, so a production environment with one broken
 * credential kept serving requests into a `Map` and told nobody. These tests
 * exist so that inverting it back — making a missing variable mean "degrade"
 * again — cannot happen without a test failing.
 */
describe('in-memory storage requires an explicit opt-in', () => {
  it('is not allowed when the variable is absent', () => {
    expect(inMemoryStoresAllowed({})).toBe(false);
  });

  it('is not allowed for any value other than the exact string "true"', () => {
    for (const value of ['1', 'yes', 'TRUE', 'True', '']) {
      expect(inMemoryStoresAllowed({ ALLOW_IN_MEMORY_STORES: value })).toBe(false);
    }
  });

  it('is allowed only for "true"', () => {
    expect(inMemoryStoresAllowed({ ALLOW_IN_MEMORY_STORES: 'true' })).toBe(true);
  });
});

describe('resolveDurableDeps', () => {
  const durable = () => 'durable' as const;
  const inMemory = () => 'in-memory' as const;
  const failing = () => {
    throw new Error('no credentials');
  };

  it('returns the durable deps when they construct', () => {
    expect(resolveDurableDeps('X', durable, inMemory)).toBe('durable');
  });

  it('throws rather than degrading when construction fails and nothing opted in', () => {
    vi.stubEnv('ALLOW_IN_MEMORY_STORES', '');
    expect(() => resolveDurableDeps('The takeaway journey', failing, inMemory)).toThrow(
      DurableStorageUnavailableError,
    );
    vi.unstubAllEnvs();
  });

  it('names what needs storage, so the failure is actionable', () => {
    vi.stubEnv('ALLOW_IN_MEMORY_STORES', '');
    expect(() => resolveDurableDeps('The notification outbox', failing, inMemory)).toThrow(
      /notification outbox/,
    );
    vi.unstubAllEnvs();
  });

  /**
   * The message is read by whoever is staring at a failing deploy, so it has
   * to say what to set — but it must never quote the underlying error, which
   * for a Supabase client construction failure can contain the key it
   * rejected.
   */
  it('never leaks the underlying cause into the message', () => {
    vi.stubEnv('ALLOW_IN_MEMORY_STORES', '');
    const leaky = () => {
      throw new Error('invalid key sb_secret_THIS_MUST_NOT_APPEAR');
    };
    try {
      resolveDurableDeps('X', leaky, inMemory);
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as Error).message).not.toContain('sb_secret_THIS_MUST_NOT_APPEAR');
      expect((error as Error).message).toContain('ALLOW_IN_MEMORY_STORES');
    }
    vi.unstubAllEnvs();
  });

  it('falls back only when the environment explicitly opted in, and reports it', () => {
    vi.stubEnv('ALLOW_IN_MEMORY_STORES', 'true');
    const onFallback = vi.fn();
    expect(resolveDurableDeps('X', failing, inMemory, onFallback)).toBe('in-memory');
    expect(onFallback).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });
});
