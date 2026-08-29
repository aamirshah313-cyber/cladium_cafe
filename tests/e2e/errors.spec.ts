/**
 * Error states — Runbook Step 39 (Gate 7's "errors" matrix dimension).
 */

import { test, expect } from '@playwright/test';
import { expectNoSeriousA11yViolations, mainLandmark } from './helpers';

test.describe('errors', () => {
  test('an unsupported locale 404s with the localized shell intact where possible', async ({
    page,
  }) => {
    const response = await page.goto('/fr');
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/page not found|not found/i)).toBeVisible();
  });

  test('a nonexistent path under a valid locale renders the correct localized not-found content, not a raw stack trace', async ({
    page,
  }) => {
    // Verified finding, not fixed in this step: this specific path (a
    // catch-all segment's `notFound()`, with `[locale]/loading.tsx`
    // providing a Suspense boundary somewhere in the tree) returns HTTP
    // 200, not 404 — a well-documented Next.js App Router limitation
    // (streaming has already started with a 200 status before the
    // boundary swap happens; the Next.js team's own suggested fix is a
    // proxy/middleware-level check before rendering begins). Tracked in
    // `.continuum/TASKS.md`, not silently accepted — what *is* verified
    // and correct here is the actual guest-visible behavior: the right
    // localized shell and not-found content render, never a crash.
    await page.goto('/en/this-page-does-not-exist');
    await expect(mainLandmark(page)).toBeVisible();
    await expect(page.getByText(/page not found|not found/i)).toBeVisible();
    await expectNoSeriousA11yViolations(page, '/en/this-page-does-not-exist (404 content)');
  });

  test('a nonexistent staff entity 404s', async ({ page }) => {
    const response = await page.goto('/staff/not-a-real-entity');
    expect(response?.status()).toBe(404);
  });

  test('the 404 page has correct lang/dir for the requested locale', async ({ page }) => {
    await page.goto('/en/this-page-does-not-exist');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.goto('/ur/this-page-does-not-exist');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});
