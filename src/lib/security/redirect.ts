/**
 * Safe redirect validation.
 *
 * A caller-supplied redirect target (`?next=`, a post-confirmation return
 * path, etc.) must never send a guest off-site — an open redirect is a
 * classic phishing primitive. This allows only a same-document relative
 * path: exactly one leading slash, no protocol-relative `//host` escape, no
 * backslash tricks some browsers normalize to `//`, and no control
 * characters.
 */

import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/security/redirect.ts');

const CONTROL_CHAR_PATTERN = new RegExp('[\\x00-\\x1f\\x7f]');

const RESOLUTION_BASE = 'https://cladium-redirect-check.invalid';

export function isSafeRedirectTarget(target: string | null | undefined): target is string {
  if (!target) return false;
  if (CONTROL_CHAR_PATTERN.test(target)) return false;
  if (!target.startsWith('/')) return false;
  if (target.startsWith('//')) return false;
  if (target.startsWith('/\\')) return false;

  let resolved: URL;
  try {
    resolved = new URL(target, RESOLUTION_BASE);
  } catch {
    return false;
  }
  // Confirms the browser would also resolve this as same-origin-relative,
  // catching any escape the prefix checks above missed.
  return resolved.origin === RESOLUTION_BASE;
}

/** Returns `target` if safe, otherwise the caller-supplied same-origin fallback. */
export function safeRedirectTarget(target: string | null | undefined, fallback: string): string {
  return isSafeRedirectTarget(target) ? target : fallback;
}
