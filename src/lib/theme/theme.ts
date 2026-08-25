/**
 * Theme primitives — Runbook Step 14.
 *
 * The theme is a guest-facing visual preference, deliberately separate from
 * language (theme-mode.md: "The theme is a guest-facing visual preference,
 * separate from language"). Unlike locale, an invalid or tampered theme
 * value has no security or routing consequence — worst case is falling back
 * to the system `prefers-color-scheme`, which the CSS in `globals.css`
 * already handles — so there is deliberately no signed-cookie machinery
 * here, unlike `lib/i18n/preference-cookie.ts`.
 */

import { themeSchema, type Theme } from '../schemas/common';

export type { Theme };
export const THEMES: readonly Theme[] = themeSchema.options;

export function isSupportedTheme(value: unknown): value is Theme {
  return themeSchema.safeParse(value).success;
}
