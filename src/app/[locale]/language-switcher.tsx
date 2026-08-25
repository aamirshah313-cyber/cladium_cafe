/**
 * Language switcher — Runbook Step 13.
 *
 * Server-rendered, no client state: each option is a plain link to
 * `/api/locale-preference`, which sets the signed locale-preference cookie
 * and redirects to the equivalent page (`swapLocaleInPath`, applied there —
 * see that route's doc comment for why it can never emit an off-site
 * redirect). Uses only reviewed chrome copy (`chromeText`) — never
 * business/menu text — and marks the active locale with `aria-current` for
 * accessibility.
 */

import { chromeText } from '../../lib/i18n/chrome';
import { LOCALES, localeDirection, type Locale } from '../../lib/i18n/locale';

interface LanguageSwitcherProps {
  readonly locale: Locale;
  readonly currentPath: string;
}

export function LanguageSwitcher({ locale, currentPath }: LanguageSwitcherProps) {
  return (
    <nav aria-label={chromeText('languageSwitcherLabel', locale)}>
      <ul>
        {LOCALES.map((targetLocale) => {
          const nameKey = targetLocale === 'en' ? 'englishLanguageName' : 'urduLanguageName';
          const isCurrent = targetLocale === locale;
          return (
            <li key={targetLocale}>
              <a
                href={`/api/locale-preference?to=${targetLocale}&path=${encodeURIComponent(currentPath)}`}
                lang={targetLocale}
                dir={localeDirection(targetLocale)}
                aria-current={isCurrent ? 'page' : undefined}
              >
                {chromeText(nameKey, targetLocale)}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
