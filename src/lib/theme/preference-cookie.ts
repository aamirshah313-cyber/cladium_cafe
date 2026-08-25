/**
 * Theme preference cookie — Runbook Step 14.
 *
 * Deliberately isomorphic and unsigned (see `theme.ts`'s doc comment for
 * why): the toggle (`app/[locale]/theme-toggle.tsx`) writes it from client
 * JS for an instant, no-reload switch, which an `HttpOnly` cookie cannot
 * support. `app/[locale]/layout.tsx` reads the same cookie (via Next's
 * `cookies()`, not this module — a plain name/value pair needs no bespoke
 * parsing) to set the initial `data-theme` attribute before first paint, so
 * there is no flash between a guest's stored choice and the rendered page.
 */

import type { Theme } from './theme';

export const THEME_COOKIE_NAME = 'cladium_theme';
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year: a display preference, not a session

export interface ThemeCookieOptions {
  /** Defaults to true. Only pass false for plain-HTTP local development. */
  readonly secure?: boolean;
  readonly maxAgeSeconds?: number;
}

/** Builds a cookie string usable both as a `Set-Cookie` header value and as a `document.cookie` assignment. */
export function serializeThemeCookie(theme: Theme, options: ThemeCookieOptions = {}): string {
  const secure = options.secure ?? true;
  const attributes = [`${THEME_COOKIE_NAME}=${theme}`, 'Path=/', 'SameSite=Lax'];
  if (secure) attributes.push('Secure');
  attributes.push(`Max-Age=${options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS}`);
  return attributes.join('; ');
}
