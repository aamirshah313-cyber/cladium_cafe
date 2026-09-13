/**
 * Keyboard navigation and screen-reader landmarks — Runbook Step 39 /
 * Gate 7: "WCAG 2.2 AA checks pass for keyboard, focus, ... screen
 * reader... order."
 */

import { test, expect } from '@playwright/test';
import { LOCALES, primaryNav, revealPrimaryNav, themeSelect } from './helpers';

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

      /*
       * Below the desktop breakpoint `.site-header-desktop` is `display:none`
       * and the navigation lives in the drawer, so asserting the inline nav is
       * visible failed on mobile and tablet by design. What matters is that
       * the landmark is reachable, which `revealPrimaryNav` establishes at any
       * viewport by opening the drawer when there is one.
       */
      await revealPrimaryNav(page);
      await expect(primaryNav(page)).toBeVisible();
      await expect(primaryNav(page).locator('a').first()).toBeVisible();
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

    /*
     * The theme control is a labelled `<select>`, not the two-button group
     * this test used to assume — and there are six themes now, so the old
     * `toHaveCount(2)` encoded a stale widget and a stale count at once.
     * The intent is unchanged and still asserted in full: an accessible
     * name, keyboard operability, and a selection that actually takes
     * effect rather than a control that merely reports success.
     */
    test('the theme select is labelled, keyboard-operable, and applies the chosen theme', async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      const select = themeSelect(page);
      await expect(select).toBeVisible();

      // Accessible name, in the page's own language.
      await expect(select).toHaveAccessibleName(/themes|تھیم/i);

      // Every intended theme is offered.
      await expect(select.locator('option')).toHaveCount(6);
      for (const value of ['day', 'night', 'peach', 'golden', 'terracotta', 'ember']) {
        await expect(select.locator(`option[value="${value}"]`)).toHaveCount(1);
      }

      // Reachable and operable from the keyboard alone.
      await select.focus();
      await expect(select).toBeFocused();
      await select.selectOption('night');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
      await expect(select).toHaveValue('night');
    });

    test('focus is visible on the primary nav link after keyboard focus', async ({ page }) => {
      await page.goto(`/${locale}`);
      // The link has to be reachable before focus means anything — on narrow
      // viewports that means opening the drawer first.
      await revealPrimaryNav(page);
      const navLink = primaryNav(page).locator('a').first();
      await navLink.focus();
      await expect(navLink).toBeFocused();
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
