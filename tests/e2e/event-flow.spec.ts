/**
 * Birthday/event enquiry — real end-to-end submission — Runbook Step 39
 * (Gate 7's "manual requests" matrix dimension). Same real-CSRF/real-
 * in-memory-domain-service reasoning as `booking-flow.spec.ts`. Confirms
 * the enquiry's success state never claims a quote or booking confirmation
 * (only a staff `QUOTED`/`CONFIRMED` transition can do that).
 */

import { test, expect } from '@playwright/test';
import { expectNoSeriousA11yViolations } from './helpers';

function futureDateInputValue(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

test.describe('event/birthday enquiry flow — English', () => {
  test('fill → review → confirm reaches the pending-staff-follow-up state, never a confirmed quote/booking', async ({
    page,
  }) => {
    await page.goto('/en/event');

    // The approved décor/cake/outside-food wording must render on this
    // page (Step 23) before the form itself.
    await expect(page.getByText(/starting from PKR 8,000/i)).toBeVisible();
    await expect(page.getByText(/does not provide cakes/i)).toBeVisible();

    await page.locator('#event-name').fill('Bilal Ahmed');
    await page.locator('#event-phone').fill('03007654321');
    await page.locator('#event-occasion').fill("Daughter's 5th birthday");
    await page.locator('#event-date').fill(futureDateInputValue(10));
    await page.locator('#event-time').fill('17:00');
    await page.locator('#event-guest-count').fill('15');
    await page.locator('#event-decor-interest').check();
    await page.locator('#event-notes').fill('Would like balloons if available.');

    await page.getByRole('button', { name: 'Review enquiry', exact: true }).click();

    const reviewText = await page.locator('dl').innerText();
    expect(reviewText).toContain('Bilal Ahmed');
    expect(reviewText).toContain('03007654321');
    expect(reviewText).toContain("Daughter's 5th birthday");
    expect(reviewText).toMatch(/Number of guests\s*\n?\s*15\b/);

    await expectNoSeriousA11yViolations(page, '/en/event review stage');

    await page.getByRole('button', { name: 'Confirm enquiry', exact: true }).click();

    await expect(page.getByRole('status')).toBeVisible();
    const confirmedText = (await page.getByRole('status').innerText()).toLowerCase();
    expect(confirmedText).toContain('not yet a confirmed quote or booking');
    expect(confirmedText).not.toMatch(/\byour (quote|booking|event) is confirmed\b/);
    expect(confirmedText).toMatch(/staff will follow up/);
  });

  test('required-field validation blocks submission with an empty form', async ({ page }) => {
    await page.goto('/en/event');
    await page.getByRole('button', { name: 'Review enquiry', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review your enquiry' })).toHaveCount(0);
  });
});

test.describe('event/birthday enquiry flow — Urdu smoke', () => {
  test('the form renders, accepts input, and reaches a review stage in Urdu', async ({ page }) => {
    await page.goto('/ur/event');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.locator('#event-name').fill('بلال احمد');
    await page.locator('#event-phone').fill('03007654321');
    await page.locator('#event-occasion').fill('سالگرہ');
    await page.locator('#event-date').fill(futureDateInputValue(10));
    await page.locator('#event-time').fill('17:00');
    await page.locator('#event-guest-count').fill('10');

    const submitButton = page.locator('form button[type="submit"]');
    await submitButton.click();

    await expect(page.locator('dl')).toBeVisible();
  });
});
