/**
 * Root not-found — Runbook Step 15.
 *
 * Fires when `[locale]/layout.tsx` calls `notFound()` for an unsupported
 * locale segment (e.g. `/xyz`) — at that point no `[locale]` root layout
 * successfully rendered, and this app has no shared top-level
 * `app/layout.tsx` (two independent root layouts instead — see
 * `app/(root-fallback)/layout.tsx` and `app/[locale]/layout.tsx`'s doc
 * comments), so this file must be fully self-sufficient: its own
 * `<html>`/`<body>`, its own `globals.css` import. No route params reach it
 * either way, so — like `[locale]/not-found.tsx` — content is bilingual.
 */

import './globals.css';
import { chrome } from '../lib/i18n/chrome';
import { LOCALES, localeDirection } from '../lib/i18n/locale';

export default function RootNotFound() {
  return (
    <html lang="en">
      <body>
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
                <a href={`/${locale}`} lang={locale} dir={localeDirection(locale)}>
                  {chrome.navHomeLabel[locale]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </body>
    </html>
  );
}
