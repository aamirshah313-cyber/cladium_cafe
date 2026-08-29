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

test.describe('locale metadata — nested route (documents current scope)', () => {
  // `[locale]/layout.tsx`'s `generateMetadata` builds alternates from the
  // locale segment only (`localeMetadataAlternates(locale)`, no sub-path) —
  // canonical/hreflang are correct for the locale root and identical on
  // every nested page today, not per-page-accurate. Gate 7's own bullet
  // asks only for correct metadata on "/en and /ur pages," satisfied here;
  // true per-page canonical URLs are a real, separate SEO improvement,
  // tracked in `.continuum/TASKS.md` rather than expanded into this step.
  test('nested pages still carry the locale-root canonical/hreflang set, not a per-page one', async ({
    page,
  }) => {
    await page.goto('/en/visit');
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/en$/);
  });
});
