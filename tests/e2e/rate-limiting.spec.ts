/**
 * Rate-limit and abuse verification — Runbook Step 40 (security and abuse
 * verification). Step 39 built the infrastructure (a real `next dev`
 * server, real session/CSRF cookies) that makes this genuinely provable
 * end to end, rather than only unit-testing the limiter primitive in
 * isolation (`tests/unit/route-rate-limits.test.ts` already does that).
 *
 * Every call here goes through `page.evaluate(() => fetch(...))` — a real
 * fetch issued from inside the browser page, not `page.request` — so the
 * browser itself attaches the real `Origin`/session-cookie headers the
 * app's own client code relies on, exactly as a genuine client would.
 *
 * Each test uses its own key namespace (a fresh per-test session cookie
 * for the guest route; a synthetic, no-other-spec-uses-it staffId for the
 * sign-in route) so this file is safe to run in any order, and safe
 * alongside `staff-roles.spec.ts`'s real dev accounts on the same shared
 * `workers: 1` server process — exhausting a rate-limit bucket here can
 * never affect a different key's bucket.
 */

import { test, expect } from '@playwright/test';
import {
  CONSENT_RATE_LIMIT_RULE,
  STAFF_SIGNIN_RATE_LIMIT_RULE,
} from '../../src/lib/http/route-rate-limits';

test.describe('guest route rate limiting', () => {
  test('POST /api/consent allows exactly its configured limit per session, then returns 429', async ({
    page,
  }) => {
    // Deliberately the home page, not `/privacy`: `consent-preferences.tsx`
    // mounts its own competing GET /api/consent on load, which can mint and
    // overwrite the session cookie behind this test's back mid-loop — a
    // race between two independently-issued requests that only exists
    // because this test captures one csrfToken up front and reuses it,
    // never a real scenario (the privacy page's own component always uses
    // the csrfToken from its own, single GET). The home page mounts no
    // consent-fetching component, so this test is the only thing touching
    // the session cookie throughout.
    await page.goto('/en');

    const { csrfToken } = await page.evaluate(async () => {
      const res = await fetch('/api/consent');
      return (await res.json()) as { csrfToken: string };
    });
    expect(csrfToken).toBeTruthy();

    const statuses = await page.evaluate(
      async ({ csrfToken, attempts }) => {
        const results: number[] = [];
        for (let i = 0; i < attempts; i += 1) {
          const res = await fetch('/api/consent', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              category: 'ESSENTIAL_PREFERENCES',
              granted: true,
              source: 'privacy_page',
              csrfToken,
            }),
          });
          results.push(res.status);
        }
        return results;
      },
      { csrfToken, attempts: CONSENT_RATE_LIMIT_RULE.max + 1 },
    );

    const successCount = statuses.filter((status) => status === 200).length;
    const rateLimitedCount = statuses.filter((status) => status === 429).length;
    expect(successCount).toBe(CONSENT_RATE_LIMIT_RULE.max);
    expect(rateLimitedCount).toBe(1);
    // The very last call — the one over budget — must be the 429; the
    // limiter must never reject an earlier, still-within-budget call.
    expect(statuses.at(-1)).toBe(429);
  });

  test('a different guest session is not affected by another session exhausting its own limit', async ({
    page,
  }) => {
    // A fresh Playwright test gets a fresh browser context, so this page
    // has never sent the consent cookie the previous test exhausted — this
    // is the live, real-cookie proof of the per-session key namespacing
    // `tests/unit/route-rate-limits.test.ts` already proves at the
    // primitive level. The home page (not `/privacy` — see the previous
    // test's comment) mounts no consent-fetching component of its own.
    await page.goto('/en');
    const { csrfToken } = await page.evaluate(async () => {
      const res = await fetch('/api/consent');
      return (await res.json()) as { csrfToken: string };
    });

    const status = await page.evaluate(async (csrfToken) => {
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: 'ESSENTIAL_PREFERENCES',
          granted: true,
          source: 'privacy_page',
          csrfToken,
        }),
      });
      return res.status;
    }, csrfToken);

    expect(status).toBe(200);
  });
});

test.describe('staff sign-in rate limiting', () => {
  test('POST /api/staff/session locks out further attempts for one attempted staffId, safely (429, never a crash)', async ({
    page,
  }, testInfo) => {
    await page.goto('/staff');

    // A synthetic staffId unique to this test run — the limiter keys on
    // the *attempted* staffId (route-rate-limits.ts's own doc comment
    // explains why, not client IP), so a fixed literal here would collide
    // across this file's own three device projects, which share one
    // `next dev` process and therefore one limiter bucket per key for the
    // whole run (found live: a fixed id passed on `desktop` alone but
    // failed on `tablet`/`desktop` when run back to back after `mobile`
    // had already exhausted it). `testInfo.testId` is unique per
    // project/retry, so each project gets its own bucket; this also stays
    // isolated from staff-roles.spec.ts's real e2e-owner/e2e-manager/
    // e2e-auditor accounts regardless of run order.
    const probeStaffId = `e2e-ratelimit-probe-${testInfo.testId}`;
    const statuses = await page.evaluate(
      async ({ attempts, staffId }) => {
        const results: number[] = [];
        for (let i = 0; i < attempts; i += 1) {
          const res = await fetch('/api/staff/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              staffId,
              devPassword: 'definitely-wrong-password',
            }),
          });
          results.push(res.status);
        }
        return results;
      },
      { attempts: STAFF_SIGNIN_RATE_LIMIT_RULE.max + 1, staffId: probeStaffId },
    );

    // Every attempt within budget correctly fails as unauthorized (the
    // credentials really are wrong) — the limiter must never mask an
    // ordinary auth failure as something else.
    const withinBudget = statuses.slice(0, STAFF_SIGNIN_RATE_LIMIT_RULE.max);
    expect(withinBudget.every((status) => status === 401)).toBe(true);
    // The call over budget is a safe 429, never a 500 or a crash.
    expect(statuses.at(-1)).toBe(429);
  });
});
