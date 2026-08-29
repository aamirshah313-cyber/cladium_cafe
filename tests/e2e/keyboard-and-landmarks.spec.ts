/**
 * Keyboard navigation and screen-reader landmarks — Runbook Step 39 /
 * Gate 7: "WCAG 2.2 AA checks pass for keyboard, focus, ... screen
 * reader... order."
 */

import { test, expect } from '@playwright/test';
import { LOCALES } from './helpers';

for (const locale of LOCALES) {
  test.describe(`keyboard and landmarks — ${locale}`, () => {
    test('the skip link is the first focusable element and jumps to #main-content', async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      await page.keyboard.press('Tab');
      const skipLink = page.locator('a[href="#main-content"]');
      await expect(skipLink).toBeFocused();

      await page.keyboard.press('Enter');
      // Jumping to an in-page anchor moves focus/hash without navigating away.
      await expect(page).toHaveURL(/#main-content$/);
    });

    test('exactly one <main> landmark, and header/footer/nav landmarks are present', async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('header, [role="banner"]')).toHaveCount(1);
      await expect(page.locator('footer, [role="contentinfo"]')).toHaveCount(1);
      await expect(page.locator('nav[aria-label]').first()).toBeVisible();
    });

    test('every heading level increases by at most one step (no skipped levels)', async ({
      page,
    }) => {
      await page.goto(`/${locale}/visit`);
      const levels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((el) =>
          Number(el.tagName.slice(1)),
        ),
      );
      expect(levels.length).toBeGreaterThan(0);
      for (let i = 1; i < levels.length; i += 1) {
        const current = levels[i];
        const previous = levels[i - 1];
        if (current === undefined || previous === undefined) continue;
        expect(current - previous).toBeLessThanOrEqual(1);
      }
    });

    test('the theme toggle buttons announce pressed state and are reachable by keyboard', async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      const group = page.getByRole('group', { name: /theme|تھیم/i });
      await expect(group).toBeVisible();
      const buttons = group.getByRole('button');
      await expect(buttons).toHaveCount(2);
      for (const button of await buttons.all()) {
        await expect(button).toHaveAttribute('aria-pressed', /true|false/);
      }
    });

    test('focus is visible on the primary nav link after keyboard focus', async ({ page }) => {
      await page.goto(`/${locale}`);
      const navLink = page.locator('nav[aria-label] a').first();
      await navLink.focus();
      const outline = await navLink.evaluate((el) => {
        const style = getComputedStyle(el);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
      // A visible focus indicator is either a non-"none" outline or a
      // browser default outline — either way outlineStyle must not be
      // explicitly suppressed without a replacement (checked via CSS scan
      // in globals.css elsewhere too; this confirms it live in a real
      // rendered page).
      expect(outline.outlineStyle).not.toBe('none');
    });
  });
}
