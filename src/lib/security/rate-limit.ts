/**
 * Provider-neutral rate-limit and abuse interface.
 *
 * Application/route code depends only on `RateLimiter`. `RateLimitStoreAdapter`
 * is the contract a durable production store (Redis, Supabase, etc.) must
 * satisfy; `createInMemoryRateLimitAdapter` is an explicit development
 * substitute, not a production fallback. Wiring a real adapter to a shared
 * store is a later, separately approved integration — this module defines
 * the shape only (production-architecture-v2.md §2 "Keep business logic
 * provider-neutral ... behind typed adapters").
 */

import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/security/rate-limit.ts');

export interface RateLimitRule {
  readonly windowMs: number;
  readonly max: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Epoch ms when the current window resets. */
  readonly resetAt: number;
}

/** The interface application/route code depends on — never a concrete store. */
export interface RateLimiter {
  consume(key: string, rule: RateLimitRule, now?: Date): Promise<RateLimitDecision>;
}

/**
 * Durable-store contract a production adapter must implement. The
 * increment and read must be a single atomic operation in the real store —
 * increment-then-read as two operations lets concurrent requests both pass
 * under a shared limit.
 */
export interface RateLimitStoreAdapter {
  incrementAndGet(
    key: string,
    windowMs: number,
    nowMs: number,
  ): Promise<{ readonly count: number; readonly resetAt: number }>;
}

export function createRateLimiter(adapter: RateLimitStoreAdapter): RateLimiter {
  return {
    async consume(key, rule, now = new Date()) {
      const { count, resetAt } = await adapter.incrementAndGet(key, rule.windowMs, now.getTime());
      return {
        allowed: count <= rule.max,
        limit: rule.max,
        remaining: Math.max(0, rule.max - count),
        resetAt,
      };
    },
  };
}

interface InMemoryWindow {
  count: number;
  resetAt: number;
}

/**
 * Development-only in-memory adapter. Explicitly not durable: state is
 * per-process, is lost on restart/redeploy, and does not coordinate across
 * concurrent Vercel function instances. Production must supply a
 * `RateLimitStoreAdapter` backed by a shared store instead of this one.
 */
export function createInMemoryRateLimitAdapter(): RateLimitStoreAdapter {
  const windows = new Map<string, InMemoryWindow>();
  return {
    async incrementAndGet(key, windowMs, nowMs) {
      const existing = windows.get(key);
      if (!existing || existing.resetAt <= nowMs) {
        const fresh: InMemoryWindow = { count: 1, resetAt: nowMs + windowMs };
        windows.set(key, fresh);
        return fresh;
      }
      existing.count += 1;
      return existing;
    },
  };
}

/** Convenience: an in-memory rate limiter for local development and tests only. */
export function createInMemoryRateLimiter(): RateLimiter {
  return createRateLimiter(createInMemoryRateLimitAdapter());
}
