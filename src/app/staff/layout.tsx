/**
 * Staff workspace root layout — Runbook Step 24.
 *
 * A third independent root layout (own `<html>`/`<body>`), alongside
 * `(root-fallback)` and `[locale]` — production-architecture-v2.md §4 lists
 * `app/staff/` as a sibling of `app/[locale]/`, not nested under it. English
 * only and unlocalized: this is an internal operational tool, not the
 * bilingual guest-facing experience CLAUDE.md's language requirements
 * describe, and it is explicitly excluded from search indexing.
 *
 * `<main>` wraps every page here, matching `[locale]/layout.tsx`'s own
 * shared landmark — found missing during Step 39's accessibility scan
 * (zero `<main>`/`role="main"` existed anywhere under `app/staff/`, an
 * axe `landmark-one-main` violation) and fixed here, once, for every
 * staff page at once.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Cladium Staff Workspace',
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body data-theme="day">
        <main>{children}</main>
      </body>
    </html>
  );
}
