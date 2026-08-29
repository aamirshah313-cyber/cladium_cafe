/**
 * Booking/treehouse request — real end-to-end submission — Runbook Step 39
 * (Gate 7's "manual requests" matrix dimension). `playwright.config.ts`'s
 * `webServer.env` supplies a local-only `SESSION_SECRET`, so the guest
 * session/CSRF mechanics genuinely work here — this exercises the real
 * `/api/bookings/{review,submit}` routes and the in-memory domain services
 * behind them (no live Postgres needed, D-023), not just a fail-closed
 * path. Confirms "a requested time is not availability" (data-model-v2.md
 * §5) — the success state never claims a confirmed reservation.
 */

import { test, expect } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers';

function futureDateInputValue(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, matches <input type="date">
}

test.describe('booking flow — English', () => {
  test('fill → review → confirm reaches the pending-staff-confirmation state, never a confirmed reservation', async ({
    page,
  }) => {
    await page.goto('/en/book');

    await page.locator('#book-name').fill('Ayesha Khan');
    await page.locator('#book-phone').fill('03001234567');
    await page.locator('#book-date').fill(futureDateInputValue(3));
    await page.locator('#book-time').fill('19:00');
    await page.locator('#book-party-size').fill('4');
    await page.getByLabel('Treehouse').check();
    await page.locator('#book-notes').fill('Window seat if possible.');

    await page.getByRole('button', { name: 'Review request', exact: true }).click();

    // Review stage — server-echoed values, not client-trusted.
    const reviewText = await page.locator('dl').innerText();
    expect(reviewText).toContain('Ayesha Khan');
    expect(reviewText).toContain('03001234567');
    expect(reviewText).toMatch(/Party size\s*\n?\s*4\b/);
    expect(reviewText).toContain('Treehouse');
    expect(reviewText).toContain('Window seat if possible.');

    await expectNoSeriousA11yViolations(page, '/en/book review stage');

    await page.getByRole('button', { name: 'Confirm request', exact: true }).click();

    await expect(page.getByRole('status')).toBeVisible();
    const confirmedText = (await page.getByRole('status').innerText()).toLowerCase();
    // The real copy says "...not yet a confirmed reservation" — that
    // literal substring is expected. What must never appear is an
    // affirmative claim that the reservation itself is confirmed.
    expect(confirmedText).toContain('not yet a confirmed reservation');
    expect(confirmedText).not.toMatch(/\byour (booking|reservation|table) is confirmed\b/);
    expect(confirmedText).toMatch(/staff will confirm/);
  });

  test('the seating preference pre-selects Treehouse from ?seating=treehouse (Home CTA)', async ({
    page,
  }) => {
    await page.goto('/en/book?seating=treehouse');
    await expect(page.getByLabel('Treehouse')).toBeChecked();
  });

  test('required-field validation blocks submission with an empty form', async ({ page }) => {
    await page.goto('/en/book');
    await page.getByRole('button', { name: 'Review request', exact: true }).click();
    // Native HTML5 required-field validation keeps the form on the fill
    // stage — the review heading must never appear.
    await expect(page.getByRole('heading', { name: 'Review your request' })).toHaveCount(0);
  });
});

test.describe('booking flow — Urdu smoke', () => {
  test('the form renders, accepts input, and reaches a review stage in Urdu', async ({ page }) => {
    await page.goto('/ur/book');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.locator('#book-name').fill('عائشہ خان');
    await page.locator('#book-phone').fill('03001234567');
    await page.locator('#book-date').fill(futureDateInputValue(3));
    await page.locator('#book-time').fill('19:00');
    await page.locator('#book-party-size').fill('2');

    const submitButton = page.locator('form button[type="submit"]');
    await submitButton.click();

    await expect(page.locator('dl')).toBeVisible();
  });
});
