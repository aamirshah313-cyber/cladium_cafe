/**
 * Reduced motion — Runbook Step 39 / Gate 7: "WCAG 2.2 AA checks pass for
 * ... reduced motion." `globals.css`'s theme-transition rule (Step 14)
 * only applies inside `@media (prefers-reduced-motion: no-preference)`, so
 * with `reduce` active no transition should be computed at all.
 */

import { test, expect } from '@playwright/test';

test.describe('reduced motion', () => {
  test('no color/background transition is applied to <body> when reduced motion is requested', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en');
    const duration = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
    // Browsers report an unset transition as "0s" (or a list of "0s"s).
    expect(duration.split(',').every((value) => value.trim() === '0s')).toBe(true);
  });

  test('the theme toggle still functions correctly with reduced motion active', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en');
    await page.getByRole('button', { name: 'Night', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  });
});

test.describe('motion allowed (default)', () => {
  test('a color transition is computed on <body> when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/en');
    const duration = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
    expect(duration.split(',').some((value) => value.trim() !== '0s')).toBe(true);
  });
});
