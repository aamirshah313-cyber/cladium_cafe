/**
 * Strict trusted-origin configuration.
 *
 * A single explicit allowlist of exact scheme+host+port strings, not a
 * same-origin heuristic and not a wildcard/suffix match — production-
 * architecture-v2.md §12 requires origin checks ahead of any mutation.
 * `Origin` is authoritative; `Referer` is only consulted when `Origin` is
 * absent (some same-origin navigations omit it), and is matched by its
 * parsed origin, never by substring.
 */

import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/security/origin.ts');

export interface TrustedOriginConfig {
  /** Exact origins, e.g. "https://cladium.example" — no path, no trailing slash, no wildcard. */
  readonly origins: readonly string[];
}

export function trustedOriginConfig(origins: readonly string[]): TrustedOriginConfig {
  return { origins: [...origins] };
}

/** Splits a comma-separated origin list (e.g. from deployment config) into a config. Blank entries are dropped. */
export function parseTrustedOrigins(csv: string): TrustedOriginConfig {
  const origins = csv
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return trustedOriginConfig(origins);
}

export function isTrustedOrigin(
  origin: string | null | undefined,
  config: TrustedOriginConfig,
): boolean {
  if (!origin) return false;
  return config.origins.includes(origin);
}

function originOfUrl(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export type OriginCheckResult =
  | { readonly trusted: true }
  | { readonly trusted: false; readonly reason: 'MISSING' | 'UNTRUSTED' };

export interface RequestOriginHeaders {
  readonly origin?: string | null;
  readonly referer?: string | null;
}

/** Resolves and validates the effective origin of an inbound request against the allowlist. */
export function checkRequestOrigin(
  headers: RequestOriginHeaders,
  config: TrustedOriginConfig,
): OriginCheckResult {
  const effectiveOrigin =
    headers.origin ?? (headers.referer ? originOfUrl(headers.referer) : undefined);
  if (!effectiveOrigin) return { trusted: false, reason: 'MISSING' };
  return isTrustedOrigin(effectiveOrigin, config)
    ? { trusted: true }
    : { trusted: false, reason: 'UNTRUSTED' };
}
