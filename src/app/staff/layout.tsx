/**
 * Staff workspace root layout — Runbook Step 24.
 *
 * A third independent root layout (own `<html>`/`<body>`), alongside
 * `(root-fallback)` and `[locale]` — production-architecture-v2.md §4 lists
 * `app/staff/` as a sibling of `app/[locale]/`, not nested under it. English
 * only and unlocalized: this is an internal operational tool, not the
 * bilingual guest-facing experience CLAUDE.md's language requirements
 * describe, and it is explicitly excluded from search indexing.
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
      <body data-theme="day">{children}</body>
    </html>
  );
}
