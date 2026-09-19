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

import { useSyncExternalStore } from 'react';
import { chromeText } from '../../lib/i18n/chrome';
import type { Locale } from '../../lib/i18n/locale';
import { serializeThemeCookie } from '../../lib/theme/preference-cookie';
import { isSupportedTheme, THEMES, type Theme } from '../../lib/theme/theme';

function subscribeTheme(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', listener);
  return () => {
    observer.disconnect();
    query.removeEventListener('change', listener);
  };
}
function currentTheme(): Theme {
  // Validated against the schema rather than a hand-written list of names:
  // the previous `=== 'day' || === 'night'` silently reported any newly
  // added theme as the system default, so the switcher would have shown
  // the wrong option selected while the page rendered correctly.
  const explicit = document.documentElement.dataset.theme;
  if (isSupportedTheme(explicit)) return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}

/**
 * One label key per theme, typed as a total map so adding a theme to
 * `themeSchema` without naming it here is a compile error rather than a
 * blank entry in the switcher. The ternary this replaces would have
 * labelled every new theme "Dark".
 */
const THEME_NAME_KEYS: Readonly<
  Record<
    Theme,
    | 'dayThemeName'
    | 'nightThemeName'
    | 'peachThemeName'
    | 'goldenThemeName'
    | 'terracottaThemeName'
    | 'emberThemeName'
  >
> = {
  day: 'dayThemeName',
  night: 'nightThemeName',
  peach: 'peachThemeName',
  golden: 'goldenThemeName',
  terracotta: 'terracottaThemeName',
  ember: 'emberThemeName',
};

interface ThemeToggleProps {
  readonly locale: Locale;
  readonly initialTheme: Theme | null;
}

export function ThemeToggle({ locale, initialTheme }: ThemeToggleProps) {
  const activeTheme = useSyncExternalStore(
    subscribeTheme,
    currentTheme,
    () => initialTheme ?? 'day',
  );

  return (
    <label className="site-preference">
      <span>{chromeText('themeSwitcherLabel', locale)}</span>
      <select
        value={activeTheme}
        onChange={(event) => {
          const theme = event.target.value as Theme;
          document.documentElement.dataset.theme = theme;
          document.cookie = serializeThemeCookie(theme, {
            secure: window.location.protocol === 'https:',
          });
        }}
      >
        {THEMES.map((theme) => (
          <option key={theme} value={theme}>
            {chromeText(THEME_NAME_KEYS[theme], locale)}
          </option>
        ))}
      </select>
    </label>
  );
}
