'use client';

/**
 * `view_menu` Meta event trigger — Runbook Step 37. Renders nothing; fires
 * once on mount via `trackMetaEventWithFreshCsrf` (best-effort, consent/
 * flag-gated server-side — this component has no idea whether anything
 * was actually sent). Mounted from both the `UNPUBLISHED` and `PUBLISHED`
 * branches of `menu/page.tsx` — visiting the route is the signal, not the
 * menu's publish state.
 */

import { useEffect } from 'react';
import { trackMetaEventWithFreshCsrf } from '../../../lib/analytics/meta-track-client';

interface MenuViewTrackerProps {
  readonly path: string;
}

export function MenuViewTracker({ path }: MenuViewTrackerProps) {
  useEffect(() => {
    trackMetaEventWithFreshCsrf('view_menu', path);
    // Intentionally fire-once on mount only — a guest changing the search/
    // category filter on this same page is not a second "viewed the menu".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
