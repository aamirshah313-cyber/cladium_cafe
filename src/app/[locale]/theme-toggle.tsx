'use client';

/**
 * Day/Night theme toggle — Runbook Step 14.
 *
 * A labelled two-button group (never icon-only, per theme-mode.md), not a
 * single icon-swap toggle, so the selected mode is always announced. Applies
 * the choice immediately by setting `data-theme` on `<html>` directly — no
 * navigation, so route, locale, scroll position, and any in-progress request
 * state are untouched (theme-mode.md §Interaction). The colour transition
 * itself lives in `globals.css`, guarded by `prefers-reduced-motion`.
 *
 * `initialTheme` is `null` when no cookie was set yet: neither button is
 * marked pressed, because the page is following `prefers-color-scheme`
 * automatically rather than an explicit guest choice (theme-mode.md:
 * `prefers-color-scheme` is only a first-visit default).
 */

import { useState } from 'react';
import { chromeText } from '../../lib/i18n/chrome';
import type { Locale } from '../../lib/i18n/locale';
import { serializeThemeCookie } from '../../lib/theme/preference-cookie';
import { THEMES, type Theme } from '../../lib/theme/theme';

interface ThemeToggleProps {
  readonly locale: Locale;
  readonly initialTheme: Theme | null;
}

export function ThemeToggle({ locale, initialTheme }: ThemeToggleProps) {
  const [activeTheme, setActiveTheme] = useState<Theme | null>(initialTheme);

  return (
    <div role="group" aria-label={chromeText('themeSwitcherLabel', locale)}>
      {THEMES.map((theme) => {
        const nameKey = theme === 'day' ? 'dayThemeName' : 'nightThemeName';
        return (
          <button
            key={theme}
            type="button"
            aria-pressed={activeTheme === theme}
            onClick={() => {
              document.documentElement.dataset.theme = theme;
              document.cookie = serializeThemeCookie(theme, {
                secure: window.location.protocol === 'https:',
              });
              setActiveTheme(theme);
            }}
          >
            {chromeText(nameKey, locale)}
          </button>
        );
      })}
    </div>
  );
}
