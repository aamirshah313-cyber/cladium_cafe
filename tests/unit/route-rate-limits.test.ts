/**
 * `lib/http/route-rate-limits.ts` — Runbook Step 40.
 *
 * `createInMemoryRateLimiter`/`createRateLimiter` themselves are already
 * fully covered by `security-primitives.test.ts`; this file only proves
 * what this new module adds: sane rule shapes, submit stricter than
 * review/cart-edit (a heavier, durable-record action deserves a tighter
 * limit — same reasoning as `issue-vapi-token.ts`'s
 * `VAPI_TOKEN_RATE_LIMIT_RULE`), and that sharing one limiter instance
 * across many routes is actually safe because each rule's key is
 * namespaced — a guest exhausting one route's window must not affect a
 * different route's window for that same session.
 */
import { describe, expect, it } from 'vitest';
import {
  guestRouteRateLimiter,
  CART_MUTATION_RATE_LIMIT_RULE,
  REQUEST_REVIEW_RATE_LIMIT_RULE,
  REQUEST_SUBMIT_RATE_LIMIT_RULE,
  CONSENT_RATE_LIMIT_RULE,
  META_TRACK_RATE_LIMIT_RULE,
  STAFF_SIGNIN_RATE_LIMIT_RULE,
} from '../../src/lib/http/route-rate-limits';

const ALL_RULES = {
  CART_MUTATION_RATE_LIMIT_RULE,
  REQUEST_REVIEW_RATE_LIMIT_RULE,
  REQUEST_SUBMIT_RATE_LIMIT_RULE,
  CONSENT_RATE_LIMIT_RULE,
  META_TRACK_RATE_LIMIT_RULE,
  STAFF_SIGNIN_RATE_LIMIT_RULE,
} as const;

describe('route-rate-limits', () => {
  it('every rule has a positive window and a positive, finite max', () => {
    for (const [name, rule] of Object.entries(ALL_RULES)) {
      expect(rule.windowMs, name).toBeGreaterThan(0);
      expect(rule.max, name).toBeGreaterThan(0);
      expect(Number.isFinite(rule.max), name).toBe(true);
    }
  });

  it('a request-submit is stricter than its own review step — a durable, staff-visible record deserves a tighter limit', () => {
    expect(REQUEST_SUBMIT_RATE_LIMIT_RULE.max).toBeLessThan(REQUEST_REVIEW_RATE_LIMIT_RULE.max);
  });

  it('the credential-guessing staff sign-in surface is the strictest rule of all', () => {
    const others = Object.values(ALL_RULES).filter((rule) => rule !== STAFF_SIGNIN_RATE_LIMIT_RULE);
    for (const rule of others) {
      expect(STAFF_SIGNIN_RATE_LIMIT_RULE.max).toBeLessThanOrEqual(rule.max);
    }
  });

  it('cart edits allow more calls per window than a review or submit — routine browsing-session editing', () => {
    expect(CART_MUTATION_RATE_LIMIT_RULE.max).toBeGreaterThan(REQUEST_REVIEW_RATE_LIMIT_RULE.max);
    expect(CART_MUTATION_RATE_LIMIT_RULE.max).toBeGreaterThan(REQUEST_SUBMIT_RATE_LIMIT_RULE.max);
  });

  it('shares one limiter instance safely: exhausting one route bucket does not affect a different route bucket for the same session', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const sessionId = 'session-shared-1';

    // Exhaust the (tight) submit bucket for this session.
    for (let i = 0; i < REQUEST_SUBMIT_RATE_LIMIT_RULE.max; i += 1) {
      const decision = await guestRouteRateLimiter.consume(
        `req-submit:${sessionId}`,
        REQUEST_SUBMIT_RATE_LIMIT_RULE,
        now,
      );
      expect(decision.allowed).toBe(true);
    }
    const exhausted = await guestRouteRateLimiter.consume(
      `req-submit:${sessionId}`,
      REQUEST_SUBMIT_RATE_LIMIT_RULE,
      now,
    );
    expect(exhausted.allowed).toBe(false);

    // The same session's *cart-item* bucket is untouched — different key prefix.
    const cartDecision = await guestRouteRateLimiter.consume(
      `cart-item:${sessionId}`,
      CART_MUTATION_RATE_LIMIT_RULE,
      now,
    );
    expect(cartDecision.allowed).toBe(true);
  });

  it('the shared limiter isolates different sessions under the same key prefix', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    for (let i = 0; i < CONSENT_RATE_LIMIT_RULE.max; i += 1) {
      await guestRouteRateLimiter.consume('consent:session-a', CONSENT_RATE_LIMIT_RULE, now);
    }
    const sessionAExhausted = await guestRouteRateLimiter.consume(
      'consent:session-a',
      CONSENT_RATE_LIMIT_RULE,
      now,
    );
    expect(sessionAExhausted.allowed).toBe(false);

    const sessionBFirstCall = await guestRouteRateLimiter.consume(
      'consent:session-b',
      CONSENT_RATE_LIMIT_RULE,
      now,
    );
    expect(sessionBFirstCall.allowed).toBe(true);
  });
});
