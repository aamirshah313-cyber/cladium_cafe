/**
 * Playwright E2E/accessibility configuration — Runbook Step 39.
 *
 * `webServer.env` starts the dev server with a **local-only, non-secret**
 * test configuration — never written to any `.env*` file, never used
 * outside this Playwright run, and never containing a real third-party
 * credential. `SESSION_SECRET`/`CRON_SECRET` are arbitrary 32+ character
 * strings (no real system trusts them); `STAFF_DEV_ACCOUNTS` is the
 * explicitly dev-only seam `modules/staff/dev-credentials.ts` documents as
 * "must never be set in production." Setting these here — rather than
 * leaving every guest/staff flow permanently fail-closed the way this
 * sandbox's manual live-checks have been throughout the project — is what
 * makes real end-to-end coverage of "manual requests, chat, voice shell,
 * staff roles" possible at all: `ANTHROPIC_API_KEY`/`VAPI_*`/`META_*`/
 * `WHATSAPP_*` stay deliberately unset, so a chat/voice call still safely
 * degrades to this codebase's own fallback-reply/error paths (never a
 * crash) exactly as it does in this sandbox already — this only unblocks
 * the guest-session/CSRF/staff-auth mechanics that were never the actual
 * unverified part.
 *
 * `FEATURE_WHATSAPP_CLOUD`/`FEATURE_META_MARKETING`/`FEATURE_ONLINE_PAYMENT`
 * stay `false`, matching `.env.example` and `CLAUDE.md` — the E2E run
 * itself is additional evidence those stay inert, not a reason to flip
 * them on.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

const TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: BASE_URL,
  // 32+ chars, arbitrary — not a real secret, never used outside this run.
  SESSION_SECRET: 'playwright-e2e-local-only-session-secret-not-real',
  CRON_SECRET: 'playwright-e2e-local-only-cron-secret-not-real',
  FEATURE_PUBLIC_SITE: 'true',
  FEATURE_TAKEAWAY_REQUESTS: 'true',
  FEATURE_BOOKING_REQUESTS: 'true',
  FEATURE_EVENT_REQUESTS: 'true',
  FEATURE_TEXT_CONCIERGE: 'true',
  FEATURE_VOICE_EN: 'true',
  FEATURE_VOICE_UR: 'true',
  FEATURE_WHATSAPP_CLOUD: 'false',
  FEATURE_META_MARKETING: 'false',
  FEATURE_ONLINE_PAYMENT: 'false',
  // Dev-only staff sign-in fixtures (modules/staff/dev-credentials.ts) —
  // one account per role, for Gate 7's "staff roles" matrix dimension.
  // Never valid outside a process launched with this exact env.
  STAFF_DEV_ACCOUNTS: JSON.stringify([
    {
      staffId: 'e2e-owner',
      displayName: 'E2E Owner',
      roles: ['OWNER'],
      devPassword: 'e2e-dev-password-owner',
    },
    {
      staffId: 'e2e-manager',
      displayName: 'E2E Manager',
      roles: ['MANAGER'],
      devPassword: 'e2e-dev-password-manager',
    },
    {
      staffId: 'e2e-order-staff',
      displayName: 'E2E Order Staff',
      roles: ['ORDER_STAFF'],
      devPassword: 'e2e-dev-password-order',
    },
    {
      staffId: 'e2e-booking-staff',
      displayName: 'E2E Booking Staff',
      roles: ['BOOKING_STAFF'],
      devPassword: 'e2e-dev-password-booking',
    },
    {
      staffId: 'e2e-auditor',
      displayName: 'E2E Auditor',
      roles: ['AUDITOR'],
      devPassword: 'e2e-dev-password-auditor',
    },
  ]),
};

export default defineConfig({
  testDir: './tests/e2e',
  // Single worker, deliberately: every test shares one real `next dev`
  // (Turbopack) server process, which lazily compiles each route on its
  // first request. Two genuine, reproduced findings during this step —
  // both booking- and event-flow tests transiently failing only under
  // concurrent execution, passing cleanly every time in isolation — traced
  // to that first-hit compile race, not a real app bug. Trading a slower
  // run for a fully reliable one, the same reliability-over-speed choice
  // this project has made throughout (`.continuum/DECISIONS.md`).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // `browserName: 'chromium'` overrides each device preset's own default
    // (`devices['iPhone 13']`/`devices['iPad (gen 7)']` both default to
    // WebKit) — deliberately: the runbook's own "mobile/tablet/desktop"
    // wording is about viewport/responsive-layout coverage, not browser-
    // engine parity, and only Chromium is installed
    // (`npx playwright install chromium`). Viewport/touch/UA emulation
    // still comes from the spread device preset; only the actual engine
    // is pinned.
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // A generous boot timeout — this sandbox has repeatedly shown genuine
    // (if unusual) slowness for `next dev`'s cold start; the default 120s
    // was observed to time out here even though the server does
    // eventually come up. Trading a slower worst case for reliability.
    timeout: 300_000,
    env: TEST_ENV,
  },
});
