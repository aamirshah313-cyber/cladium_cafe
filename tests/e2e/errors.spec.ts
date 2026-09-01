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

  test('a nonexistent path under a valid locale 404s with the correct localized not-found content', async ({
    page,
  }) => {
    // Fixed Step 45 (D-058): a catch-all segment's `notFound()`, with
    // `[locale]/loading.tsx` providing a Suspense boundary somewhere in the
    // tree, used to return HTTP 200 instead of 404 — a documented Next.js
    // App Router limitation (streaming starts with a 200 status before the
    // boundary swap happens). Fixed at the proxy layer, before any
    // rendering starts (`src/proxy.ts`'s `KNOWN_LOCALE_PAGES` check) — the
    // guest-visible content was already correct before this fix; now the
    // status code is too.
    const response = await page.goto('/en/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(mainLandmark(page)).toBeVisible();
    await expect(page.getByText(/page not found|not found/i)).toBeVisible();
    await expectNoSeriousA11yViolations(page, '/en/this-page-does-not-exist (404 content)');
  });

  test('an extra path segment under a known locale page also 404s', async ({ page }) => {
    const response = await page.goto('/en/menu/extra-segment');
    expect(response?.status()).toBe(404);
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
