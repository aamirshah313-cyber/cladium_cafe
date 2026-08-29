/**
 * English/Urdu × Day/Night matrix (the viewport axis is a Playwright
 * project — mobile/tablet/desktop) — Runbook Step 39 / Gate 7: "English/
 * Urdu × Day/Night × mobile/tablet/desktop Playwright matrix passes."
 *
 * Per combination, per page: render succeeds, theme applies correctly, no
 * horizontal overflow, and an axe scan finds no critical/serious
 * violation. This is the primary "matrix report" evidence this step's own
 * wording asks for — Playwright's HTML/JSON reporters (configured in
 * `playwright.config.ts`) already produce the artifacts (screenshots,
 * traces on failure) alongside this pass/fail matrix.
 */

import { test, expect } from '@playwright/test';
import {
  LOCALE_THEME_COMBOS,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  mainLandmark,
  setThemeViaToggle,
} from './helpers';

const PAGES: readonly { path: string; heading: RegExp }[] = [
  { path: '', heading: /Cladium Café/i },
  { path: '/visit', heading: /.+/ },
  { path: '/menu', heading: /.+/ },
  { path: '/book', heading: /.+/ },
  { path: '/event', heading: /.+/ },
  { path: '/concierge', heading: /.+/ },
  { path: '/privacy', heading: /.+/ },
];

for (const { locale, theme } of LOCALE_THEME_COMBOS) {
  test.describe(`matrix — ${locale} × ${theme}`, () => {
    for (const { path } of PAGES) {
      test(`/${locale}${path}: renders, themes, no overflow, no serious a11y violation`, async ({
        page,
      }) => {
        await page.goto(`/${locale}${path}`);
        await expect(mainLandmark(page)).toBeVisible();

        await setThemeViaToggle(page, theme, locale);
        await expectNoHorizontalOverflow(page);
        await expectNoSeriousA11yViolations(page, `/${locale}${path} (${theme})`);
      });
    }
  });
}
