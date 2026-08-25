'use client';

/**
 * Root error boundary — Runbook Step 15.
 *
 * Only fires for an error thrown above `[locale]/error.tsx`'s boundary
 * (e.g. inside a root layout itself) — everything else is caught closer to
 * where it happened. Next.js requires `global-error.js` to render its own
 * complete `<html>`/`<body>`, since it replaces the root layout when it
 * fires. `error.message` is never rendered, same reasoning as
 * `[locale]/error.tsx`. No route params reach it, so content is bilingual.
 */

import { useEffect } from 'react';
import { chrome } from '../lib/i18n/chrome';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div>
          <h1>
            <span lang="en">{chrome.errorHeading.en}</span>
            {' / '}
            <span lang="ur" dir="rtl">
              {chrome.errorHeading.ur}
            </span>
          </h1>
          <p>
            <span lang="en">{chrome.errorBody.en}</span>
            {' / '}
            <span lang="ur" dir="rtl">
              {chrome.errorBody.ur}
            </span>
          </p>
          <button type="button" onClick={() => reset()}>
            <span lang="en">{chrome.errorRetry.en}</span>
            {' / '}
            <span lang="ur" dir="rtl">
              {chrome.errorRetry.ur}
            </span>
          </button>
        </div>
      </body>
    </html>
  );
}
