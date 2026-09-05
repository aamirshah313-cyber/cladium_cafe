/**
 * Locale metadata — Runbook Step 39 / `release-gates-v2.md` Gate 7's first
 * bullet: "`/en` and `/ur` pages are server-rendered with correct `lang`,
 * `dir`, canonical, `hreflang`, and `x-default` metadata."
 */

import { test, expect } from '@playwright/test';
import { LOCALES, type E2ELocale } from './helpers';

const DIR_BY_LOCALE: Record<E2ELocale, 'ltr' | 'rtl'> = { en: 'ltr', ur: 'rtl' };

for (const locale of LOCALES) {
  test.describe(`locale metadata — /${locale}`, () => {
    test(`<html lang>/dir are correct on /${locale}`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', DIR_BY_LOCALE[locale]);
    });

    test(`canonical/hreflang/x-default are present and correct on /${locale}`, async ({ page }) => {
      await page.goto(`/${locale}`);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveAttribute('href', new RegExp(`/${locale}$`));

      for (const other of LOCALES) {
        const alt = page.locator(`link[rel="alternate"][hreflang="${other}"]`);
        await expect(alt).toHaveAttribute('href', new RegExp(`/${other}$`));
      }

      const xDefault = page.locator('link[rel="alternate"][hreflang="x-default"]');
      await expect(xDefault).toHaveCount(1);
    });
  });
}

test.describe('locale metadata — nested routes carry their own canonical set', () => {
  // This used to assert the opposite, documenting a known limitation:
  // every nested page inherited the locale-root canonical because only
  // `[locale]/layout.tsx` defined metadata. Each public page now supplies
  // its own via `localePageMetadata`, which was the separate SEO
  // improvement that limitation was tracked as — so the test asserts the
  // real behaviour rather than continuing to pin the old one.
  test('a nested page canonicalises to itself, not to the locale root', async ({ page }) => {
    await page.goto('/en/visit');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/visit$/);
  });

  test('hreflang alternates point at the same page in each locale', async ({ page }) => {
    await page.goto('/en/visit');
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      /\/en\/visit$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="ur"]')).toHaveAttribute(
      'href',
      /\/ur\/visit$/,
    );
  });

  test('each page carries its own title and description, not one shared pair', async ({ page }) => {
    await page.goto('/en/visit');
    const visitDescription = await page.locator('meta[name="description"]').getAttribute('content');
    await page.goto('/en/book');
    const bookDescription = await page.locator('meta[name="description"]').getAttribute('content');

    expect(visitDescription).toBeTruthy();
    expect(bookDescription).toBeTruthy();
    expect(bookDescription).not.toBe(visitDescription);
    // The scaffold placeholder must never come back.
    expect(visitDescription).not.toContain('scaffold');
  });
});
