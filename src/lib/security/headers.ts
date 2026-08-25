/**
 * CSP and security response headers, suitable for Next.js middleware or a
 * route handler to apply. This module has no dependency on either — it
 * returns plain values — because `next.config.ts` `headers()` cannot see a
 * per-request nonce and middleware/route handlers can, so the caller
 * decides where to apply it.
 *
 * Defaults are deliberately strict: no `'unsafe-inline'` for scripts or
 * styles. A caller that needs an inline `<script>` or `<style>` must
 * generate a per-request nonce and pass it in rather than loosening the
 * default policy.
 */

import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/security/headers.ts');

export interface SecurityHeadersOptions {
  /** Per-request CSP nonce, if the caller renders an inline `<script>` or `<style>` tag. */
  readonly nonce?: string;
  /** Additional trusted API origins beyond `'self'` (e.g. Supabase, Anthropic, Vapi endpoints actually called from the browser). */
  readonly connectSrc?: readonly string[];
  /** Emits `Content-Security-Policy-Report-Only` instead of the enforcing header, for staged rollout. */
  readonly reportOnly?: boolean;
}

export function buildContentSecurityPolicy(options: SecurityHeadersOptions = {}): string {
  const nonceSource = options.nonce ? [`'nonce-${options.nonce}'`] : [];
  const directives: readonly (readonly [string, readonly string[]])[] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...nonceSource]],
    ['style-src', ["'self'", ...nonceSource]],
    ['img-src', ["'self'", 'data:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", ...(options.connectSrc ?? [])]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['object-src', ["'none'"]],
    ['upgrade-insecure-requests', []],
  ];
  return directives
    .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

export function securityHeaders(options: SecurityHeadersOptions = {}): Record<string, string> {
  const cspHeaderName = options.reportOnly
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';
  return {
    [cspHeaderName]: buildContentSecurityPolicy(options),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Microphone stays origin-scoped (not blanket-denied) because Vapi
    // browser voice needs it under separate, explicit user consent
    // (production-architecture-v2.md §12); every other sensor is denied.
    'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=()',
  };
}

/** Applies every security header onto an existing `Headers` object (mutates and returns it, matching the `http/responses.ts` header-building style). */
export function applySecurityHeaders(
  headers: Headers,
  options: SecurityHeadersOptions = {},
): Headers {
  for (const [name, value] of Object.entries(securityHeaders(options))) {
    headers.set(name, value);
  }
  return headers;
}
