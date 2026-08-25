/**
 * Route-level not-found state — Runbook Step 15.
 *
 * Renders inside the already-validated `[locale]/layout.tsx` (correct
 * `lang`/`dir`/`data-theme`) for a path within a real locale that doesn't
 * match any route. `not-found.js` receives no route params, so — like
 * `loading.tsx` — content is bilingual rather than guessed.
 */

import Link from 'next/link';
import { chrome } from '../../lib/i18n/chrome';
import { LOCALES, localeDirection } from '../../lib/i18n/locale';

export default function LocaleNotFound() {
  return (
    <div>
      <h1>
        <span lang="en">{chrome.notFoundHeading.en}</span>
        {' / '}
        <span lang="ur" dir="rtl">
          {chrome.notFoundHeading.ur}
        </span>
      </h1>
      <p>
        <span lang="en">{chrome.notFoundBody.en}</span>
        {' / '}
        <span lang="ur" dir="rtl">
          {chrome.notFoundBody.ur}
        </span>
      </p>
      <ul>
        {LOCALES.map((locale) => (
          <li key={locale}>
            <Link href={`/${locale}`} lang={locale} dir={localeDirection(locale)}>
              {chrome.navHomeLabel[locale]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
