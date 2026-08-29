/**
 * Concierge chat/voice shell — Runbook Step 39 (Gate 7's "chat, voice
 * shell" matrix dimensions). `playwright.config.ts` enables
 * `FEATURE_TEXT_CONCIERGE`/`FEATURE_VOICE_EN`/`FEATURE_VOICE_UR` but
 * deliberately leaves `ANTHROPIC_API_KEY`/`VAPI_*` unset — this proves the
 * codebase's own safe-fallback design end to end in a real browser: a
 * guest sending a chat message, or trying to start a voice call, without
 * a live model/Vapi credential must reach a safe, on-brand fallback reply
 * or error message, never a crash or a raw stack trace.
 */

import { test, expect } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers';

test.describe('concierge — Type mode', () => {
  test('/en/concierge renders the Type/Talk toggle and defaults to Type', async ({ page }) => {
    await page.goto('/en/concierge');
    const group = page.getByRole('group', { name: 'Concierge mode' });
    await expect(group).toBeVisible();
    await expect(page.getByRole('button', { name: 'Type', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('Your message')).toBeVisible();
    await expectNoSeriousA11yViolations(page, '/en/concierge (Type)');
  });

  test('sending a message without a live model credential reaches a safe fallback reply, never a crash', async ({
    page,
  }) => {
    await page.goto('/en/concierge');
    await page.getByLabel('Your message').fill('What time do you open?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    const log = page.locator('ul[aria-live="polite"]');
    await expect(log).toContainText(/whatsapp/i, { timeout: 15_000 });
    // The page itself must never fall into the generic error boundary.
    await expect(
      page.getByRole('heading', { name: 'Something went wrong', exact: true }),
    ).toHaveCount(0);
  });
});

test.describe('concierge — Talk mode', () => {
  test('switching to Talk shows the microphone-consent prompt before any call can start', async ({
    page,
  }) => {
    await page.goto('/en/concierge');
    await page.getByRole('button', { name: 'Talk', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Talk to Cladium' })).toBeVisible();
    await expect(page.getByText(/consent to use the microphone/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Allow microphone access', exact: true }),
    ).toBeVisible();
    // The real Start Call control must not be reachable before consent.
    await expect(page.getByRole('button', { name: 'Start voice call', exact: true })).toHaveCount(
      0,
    );

    await expectNoSeriousA11yViolations(page, '/en/concierge (Talk, no consent)');
  });

  test('granting microphone consent reveals Start Call, and starting without live Vapi credentials fails safely, not with a crash', async ({
    page,
  }) => {
    await page.goto('/en/concierge');
    await page.getByRole('button', { name: 'Talk', exact: true }).click();
    await page.getByRole('button', { name: 'Allow microphone access', exact: true }).click();

    const startButton = page.getByRole('button', { name: 'Start voice call', exact: true });
    // A generous timeout: the consent grant is a real POST /api/consent
    // round trip, and `next dev`'s on-demand route compilation can make
    // this route's first hit in a session slow. Raised from 15s to 25s
    // (Step 40): reproduced twice in a full 249-test run under full-suite
    // CPU/IO contention (video/trace recording across all specs) despite
    // passing reliably — 3-6s — in isolation every time; environment
    // timing, not an app defect (Step 40's own two code changes never
    // touch this route or this page at all).
    await expect(startButton).toBeVisible({ timeout: 25_000 });
    await startButton.click();

    // No live VAPI_* credentials exist in this test environment, so this
    // must resolve to the app's own safe error state, never a raw crash.
    // `.first()`: the call-state error banner and the API-error banner
    // can both legitimately render for the same failure — either is
    // sufficient proof this stayed a safe error state, not a crash.
    await expect(page.locator('p[role="alert"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('heading', { name: 'Something went wrong', exact: true }),
    ).toHaveCount(0);
  });
});

test.describe('concierge — Urdu smoke', () => {
  test('/ur/concierge renders RTL with the localized Type/Talk toggle', async ({ page }) => {
    await page.goto('/ur/concierge');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('group', { name: 'قونصیرج موڈ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'بات کریں', exact: true })).toBeVisible();
  });
});
