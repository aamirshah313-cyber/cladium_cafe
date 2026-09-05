'use client';

/**
 * Route-level error boundary — Runbook Step 15.
 *
 * `error.js` must be a Client Component and receives only `{ error, reset }`
 * — no route params — so locale comes from `usePathname()` via
 * `localeFromPathname` (see that function's doc comment). `error.message`
 * is never rendered: a caught render error is unstructured and might carry
 * internal detail, so this shows only the generic, reviewed copy that
 * every other safe-error surface in this app uses (`lib/errors.ts`).
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { chromeText } from '../../lib/i18n/chrome';
import { localeFromPathname } from '../../lib/i18n/locale';

export default function LocaleError({ error, reset }: { error: Error; reset: () => void }) {
  const locale = localeFromPathname(usePathname());

  // Browser-console only — never rendered to the guest. No client-side
  // error-reporting integration is approved yet; this is standard debugging
  // visibility, not a substitute for one.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="state-block">
      <h1>{chromeText('errorHeading', locale)}</h1>
      <p className="u-lede">{chromeText('errorBody', locale)}</p>
      {/* Both recoveries are offered: retry the failed render, or leave for
          a page known to work. */}
      <div className="form-actions state-actions">
        <button type="button" className="u-button u-button--primary" onClick={() => reset()}>
          {chromeText('errorRetry', locale)}
        </button>
        <Link href={`/${locale}`} className="u-button u-button--secondary">
          {chromeText('errorHomeLink', locale)}
        </Link>
      </div>
    </div>
  );
}
