/**
 * Root-fallback layout — Runbook Step 13.
 *
 * A separate Next.js "root layout" (via the `(root-fallback)` route group)
 * so it has its own independent `<html>`/`<body>`, rather than sitting above
 * `app/[locale]/layout.tsx` in the tree. Next.js only merges a nested
 * duplicate `<html>` tag's *missing* attributes onto the outer one — it
 * never overwrites an attribute the outer tag already set. A single shared
 * `app/layout.tsx` with `<html lang="en">` above `[locale]/layout.tsx`
 * previously left every Urdu route reporting `lang="en"` to the browser and
 * assistive tech, even though `dir="rtl"` (unset on the outer tag) came
 * through correctly — see `.continuum/DECISIONS.md`.
 */

import type { ReactNode } from 'react';

export default function RootFallbackLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
