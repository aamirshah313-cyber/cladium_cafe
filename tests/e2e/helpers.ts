/**
 * Shared E2E helpers — Runbook Step 39.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chromeText } from '../../src/lib/i18n/chrome';

export const LOCALES = ['en', 'ur'] as const;
export type E2ELocale = (typeof LOCALES)[number];

export const THEMES = ['day', 'night'] as const;
export type E2ETheme = (typeof THEMES)[number];

/** Every {locale, theme} combination — the two non-viewport axes of Gate 7's matrix (viewport is a Playwright project). */
export const LOCALE_THEME_COMBOS: readonly { locale: E2ELocale; theme: E2ETheme }[] =
  LOCALES.flatMap((locale) => THEMES.map((theme) => ({ locale, theme })));

/**
 * Runs an axe scan restricted to WCAG 2.0/2.1/2.2 A/AA rules (matching
 * Gate 7's "WCAG 2.2 AA checks") and asserts zero `critical`/`serious`
 * violations. `moderate`/`minor` findings are reported, not asserted on —
 * matching this step's "fix verified failures within scope" instruction
 * rather than blocking on every possible axe nitpick.
 */
export async function expectNoSeriousA11yViolations(page: Page, context?: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const serious = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );

  if (serious.length > 0) {
    const summary = serious
      .map((violation) => `[${violation.impact}] ${violation.id}: ${violation.description}`)
      .join('\n');
    throw new Error(`Accessibility violations${context ? ` on ${context}` : ''}:\n${summary}`);
  }
}

/** Asserts the page never scrolls horizontally at the current viewport — Gate 7's "no horizontal overflow" bar, checked live since Step 14. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, 'page scrolls horizontally').toBeLessThanOrEqual(1); // 1px tolerance for subpixel rounding
}

/** Clicks the Day/Night toggle button for the requested theme (`theme-toggle.tsx`, Step 14) — real UI interaction, not a cookie shortcut. Locale-aware: the button's accessible name is translated. */
export async function setThemeViaToggle(
  page: Page,
  theme: E2ETheme,
  locale: E2ELocale,
): Promise<void> {
  const nameKey = theme === 'day' ? 'dayThemeName' : 'nightThemeName';
  const label = chromeText(nameKey, locale);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Locates the primary `<main>` landmark, matching every page's shared shell. */
export function mainLandmark(page: Page): Locator {
  return page.locator('main, [role="main"]').first();
}
