/**
 * Zoom — Runbook Step 39 / Gate 7: "WCAG 2.2 AA checks pass for ... zoom."
 *
 * Playwright/Chromium has no direct "browser zoom" control; 200% page zoom
 * is equivalent, for layout purposes, to halving the effective CSS
 * viewport (WCAG 1.4.10 Reflow's own definition uses an equivalent-CSS-
 * pixel-width framing) — the standard practical approach for zoom testing
 * without a real DevTools zoom control. Applied only within this file, on
 * top of whatever viewport each project already sets.
 */

import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, mainLandmark } from './helpers';

const PAGES = ['', '/visit', '/menu', '/book'];

test.describe('200% zoom (halved effective viewport)', () => {
  test.beforeEach(async ({ page }) => {
    const current = page.viewportSize();
    const half = current
      ? { width: Math.max(320, Math.round(current.width / 2)), height: current.height }
      : { width: 320, height: 800 };
    await page.setViewportSize(half);
  });

  for (const path of PAGES) {
    test(`/en${path} reflows without horizontal scroll or clipped content at 200% zoom`, async ({
      page,
    }) => {
      await page.goto(`/en${path}`);
      await expect(mainLandmark(page)).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('the home page has no serious accessibility violation at 200% zoom', async ({ page }) => {
    await page.goto('/en');
    await expectNoSeriousA11yViolations(page, '/en at 200% zoom');
  });
});
