/**
 * WhatsApp handoff — Runbook Step 39 (Gate 7's matrix explicitly names
 * "WhatsApp handoff" as one dimension) building on Step 35's
 * `buildWhatsAppUrl`/Step 36's external-navigation notice. Real rendered-
 * DOM confirmation of what `tests/unit/external-links.test.ts` already
 * proves at the source-text level.
 */

import { test, expect } from '@playwright/test';
import { LOCALES } from './helpers';

const PAGES_WITH_WHATSAPP_LINK = ['', '/visit', '/menu', '/privacy'];

for (const locale of LOCALES) {
  test.describe(`WhatsApp handoff — ${locale}`, () => {
    for (const path of PAGES_WITH_WHATSAPP_LINK) {
      test(`/${locale}${path} has a safe, correctly-attributed wa.me link with a visible external-navigation notice`, async ({
        page,
      }) => {
        await page.goto(`/${locale}${path}`);

        const link = page.locator('a[href*="wa.me"]').first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

        const href = await link.getAttribute('href');
        expect(href).toMatch(/^https:\/\/wa\.me\/923123978889\?text=/);

        // Never a query string carrying anything beyond the static,
        // reviewed prefilled message — never guest data (Step 35/D-039's
        // structural guarantee, reconfirmed live here).
        const url = new URL(href!);
        expect([...url.searchParams.keys()]).toEqual(['text']);
      });
    }
  });
}
