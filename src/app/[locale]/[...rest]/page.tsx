/**
 * Catch-all 404 for any unmatched path under a valid locale — Runbook Step 15.
 *
 * Without this, a request like `/en/nonexistent` matches no route at all
 * (no `page.tsx` exists at that exact path), so Next.js's router never
 * instantiates `[locale]/layout.tsx` and falls all the way back to the
 * root `app/not-found.tsx` — losing the correct `lang`/`dir`/`data-theme`
 * and the site header/footer. This segment claims every such path, and
 * `notFound()` then renders `[locale]/not-found.tsx` *inside* the already-
 * validated locale layout, exactly like an explicit `notFound()` call from
 * a real page would. Locale itself needs no re-validation here — the
 * parent layout already rejected an unsupported segment before this could
 * render.
 */

import { notFound } from 'next/navigation';

export default function LocaleCatchAll(): never {
  notFound();
}
