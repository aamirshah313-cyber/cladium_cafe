/**
 * CSP and security response headers, suitable for Next.js middleware or a
 * route handler to apply. This module has no dependency on either — it
 * returns plain values — because `next.config.ts` `headers()` cannot see a
 * per-request nonce and middleware/route handlers can, so the caller
 * decides where to apply it.
 *
 * Runbook Step 40 found this module itself was the gap: fully built and
 * unit-tested since Step 12, but never actually wired into any response —
 * `next.config.ts` had no `headers()` at all, so this app shipped zero of
 * these headers in practice. `next.config.ts` now calls `securityHeaders()`
 * directly for every route.
 *
 * That wiring is deliberately *static* (`next.config.ts`'s `headers()`,
 * no nonce) rather than the fully nonce-based CSP Next.js's own docs
 * recommend (nextjs.org/docs/app/guides/content-security-policy) — a real
 * per-request nonce needs every page to opt into dynamic rendering (Next's
 * own documented requirement: "all pages must be dynamically rendered"),
 * and this app still has three statically-rendered routes (`/`,
 * `/_not-found`, `/staff`). Converting those is a genuine, separately-
 * scoped architectural change (loses static generation/ISR for the whole
 * site), tracked in `.continuum/TASKS.md`, not folded into this fix.
 * Without a nonce, `'unsafe-inline'` is the honest, functioning baseline:
 * Next.js's own framework-injected inline scripts (the RSC hydration
 * payload) require it to run at all. This app has no inline script/style
 * of its own to protect against — no `dangerouslySetInnerHTML`, no
 * authored `<script>`/`<style>` tag anywhere (confirmed by source scan) —
 * so `'unsafe-inline'` here only ever covers Next.js's own required
 * bootstrap, never anything this app could have chosen to author safely
 * instead. `'unsafe-eval'` is added only when `allowEval` is set (dev-only
 * — React's dev-mode error-stack reconstruction needs it; production
 * never sets this, matching Next's own documented dev/production split).
 */

import { assertServerOnly } from '../server-only';

assertServerOnly('src/lib/security/headers.ts');

export interface SecurityHeadersOptions {
  /** Per-request CSP nonce, if the caller renders an inline `<script>` or `<style>` tag. Omitting it falls back to `'unsafe-inline'` — see the module doc comment for why that is the current, deliberate, honest baseline. */
  readonly nonce?: string;
  /** Additional trusted API origins beyond `'self'` (e.g. Supabase, Anthropic, Vapi endpoints actually called from the browser). `next.config.ts` now populates this with the configured Supabase project's origin (D-059 follow-up — `staff/reset-password{,/confirm}/page.tsx` is real browser code that calls Supabase's Auth API directly; found live when CSP silently blocked that call). Vapi's web SDK is still unwired here; populate this further before enabling `FEATURE_VOICE_EN`/`FEATURE_VOICE_UR` in any real environment, confirmed against Vapi's current required origins first. */
  readonly connectSrc?: readonly string[];
  /** Additional trusted script origins beyond `'self'` (e.g. the Meta Pixel's `connect.facebook.net`, only when `next.config.ts` finds `FEATURE_META_MARKETING` on and `META_PIXEL_ID` configured). */
  readonly scriptSrc?: readonly string[];
  /** Dev-only: adds `'unsafe-eval'` to `script-src` for React's dev-mode error-stack reconstruction. Never set in production. */
  readonly allowEval?: boolean;
  /** Emits `Content-Security-Policy-Report-Only` instead of the enforcing header, for staged rollout. */
  readonly reportOnly?: boolean;
}

export function buildContentSecurityPolicy(options: SecurityHeadersOptions = {}): string {
  const nonceSource = options.nonce ? [`'nonce-${options.nonce}'`] : [];
  const inlineFallback = options.nonce ? [] : ["'unsafe-inline'"];
  const evalSource = options.allowEval ? ["'unsafe-eval'"] : [];
  const directives: readonly (readonly [string, readonly string[]])[] = [
    ['default-src', ["'self'"]],
    [
      'script-src',
      ["'self'", ...nonceSource, ...inlineFallback, ...evalSource, ...(options.scriptSrc ?? [])],
    ],
    ['style-src', ["'self'", ...nonceSource, ...inlineFallback]],
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
