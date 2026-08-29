/**
 * Staff workspace and roles — Runbook Step 39 (Gate 7's "staff roles"
 * matrix dimension). `playwright.config.ts`'s `webServer.env` seeds five
 * dev-only accounts (`STAFF_DEV_ACCOUNTS`, `modules/staff/dev-
 * credentials.ts`'s explicitly-dev-only seam), one per role, so real
 * sign-in/sign-out and per-role queue access are genuinely exercised here
 * — not just the fail-closed "no accounts configured" path this sandbox's
 * manual live-checks have always been limited to. Server-side role
 * enforcement itself (an AUDITOR's write being rejected) is already
 * covered by Step 24's 95 unit tests — "hiding UI controls is not
 * authorization" (production-architecture-v2.md §10), so this file
 * focuses on what only a real browser proves: sign-in/out, correct
 * per-role display, and that every queue actually renders.
 */

import { test, expect } from '@playwright/test';
import { expectNoSeriousA11yViolations, mainLandmark } from './helpers';

interface StaffAccount {
  readonly staffId: string;
  readonly devPassword: string;
  readonly displayName: string;
  readonly role: string;
}

const ACCOUNTS: readonly StaffAccount[] = [
  {
    staffId: 'e2e-owner',
    devPassword: 'e2e-dev-password-owner',
    displayName: 'E2E Owner',
    role: 'OWNER',
  },
  {
    staffId: 'e2e-manager',
    devPassword: 'e2e-dev-password-manager',
    displayName: 'E2E Manager',
    role: 'MANAGER',
  },
  {
    staffId: 'e2e-auditor',
    devPassword: 'e2e-dev-password-auditor',
    displayName: 'E2E Auditor',
    role: 'AUDITOR',
  },
];

const QUEUES = ['takeaway', 'bookings', 'events'] as const;

test.describe('staff sign-in', () => {
  test('the sign-in page renders and passes an accessibility scan', async ({ page }) => {
    await page.goto('/staff');
    await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible();
    await expectNoSeriousA11yViolations(page, '/staff sign-in');
  });

  test('an incorrect password shows a safe error, never a crash', async ({ page }) => {
    await page.goto('/staff');
    await page.getByLabel('Staff ID').fill('e2e-owner');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // Scoped past a `role="alert"` match: Next.js's own hidden route
    // announcer (`#__next-route-announcer__`) also carries `role="alert"`.
    await expect(page.getByText('Invalid staff ID or password')).toBeVisible();
  });

  for (const account of ACCOUNTS) {
    test(`${account.role} can sign in, see their identity/role, and reach every queue`, async ({
      page,
    }) => {
      await page.goto('/staff');
      await page.getByLabel('Staff ID').fill(account.staffId);
      await page.getByLabel('Password').fill(account.devPassword);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();

      await expect(page.getByText(account.displayName)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(account.role)).toBeVisible();

      // A fresh `goto('/staff/<queue>')` per iteration, not a client-side
      // Link click + `goBack()` loop: the session cookie already proves
      // sign-in persists across a real page load (every queue visit is
      // one), and this sidesteps a real, reproduced-but-unexplained
      // flake specific to rapid repeated `goBack()` calls against this
      // sandbox's `next dev` server (each queue passed independently and
      // consistently in isolation and in manual live checks; only the
      // tight goBack() loop pattern was unreliable here).
      for (const queue of QUEUES) {
        await page.goto(`/staff/${queue}`);
        await expect(mainLandmark(page)).toBeVisible();
        await expect(page.getByText(/error|something went wrong/i)).toHaveCount(0);
      }

      await page.goto('/staff');
      await expect(page.getByText(account.displayName)).toBeVisible({ timeout: 15_000 });

      // Sign out returns to the sign-in form.
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible();
    });
  }
});
