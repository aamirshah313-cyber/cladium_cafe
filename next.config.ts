import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security/headers';
import {
  isSupabasePublicCredentialsConfigured,
  parseSupabasePublicCredentials,
} from './src/lib/env';
import { isFeatureEnabled, parseMetaPixelId } from './src/lib/env.server';

/**
 * Runbook Step 40 (security and abuse verification) found `lib/security/
 * headers.ts` — fully built and unit-tested since Step 12 — was never
 * actually applied to a response: `next.config.ts` had no `headers()` at
 * all, so this app shipped none of CSP/HSTS/X-Frame-Options/Permissions-
 * Policy/Referrer-Policy in practice, a real gap against `release-gates-
 * v2.md` Gate 8's first checklist bullet. `headers.ts`'s own doc comment
 * explains why this is a *static* (no per-request nonce) application and
 * what a stricter, nonce-based CSP would require later.
 *
 * Skipped entirely in `next dev`: live-checking this fix found `next dev`'s
 * own Turbopack dev tooling breaks under it — `X-Content-Type-Options:
 * nosniff` makes the browser refuse to execute
 * `_next/static/development/_clientMiddlewareManifest.js` (served by
 * Turbopack's dev server with an `application/json` content type despite
 * being loaded as a script), which then crashes Turbopack's own dev
 * overlay (`Runtime SyntaxError: Unexpected end of JSON input`) and blanks
 * the page — a `next dev`-only Turbopack tooling quirk, not a defect in
 * this app or in the headers themselves. Verified clean instead against a
 * real `next build && next start` production server: full render/
 * hydration, no console errors, every header present exactly as built.
 * This means the Step 39 E2E suite (which runs against `next dev`) never
 * exercises these headers — Step 43 (staging release) is the next point
 * a real deployed environment can verify them end to end; tracked in
 * `.continuum/TASKS.md`.
 *
 * D-059 follow-up: `connect-src` now also allows the configured Supabase
 * project's own origin. `headers.ts`'s own doc comment already flagged this
 * as needed "before... a live Supabase browser client" existed — D-059
 * wired one in (`staff/reset-password{,/confirm}/page.tsx`, the first
 * browser code in this app to ever call Supabase directly; every earlier
 * use was server-side, which CSP does not restrict) without updating this
 * file, and the gap went undetected until a real recovery session hit it
 * live: `fetch('.../auth/v1/user')` silently blocked by `connect-src
 * 'self'`, which the Supabase client swallows into "no session detected" —
 * indistinguishable from an expired link without checking the browser
 * console directly, which is what actually caught this. Derived from
 * `NEXT_PUBLIC_SUPABASE_URL` rather than a hardcoded project ref, so this
 * stays correct across environments; omitted entirely (falls back to
 * `'self'` only, unchanged from before) when Supabase isn't configured —
 * this sandbox and CI included — so an unconfigured environment still
 * builds cleanly.
 */
function supabaseConnectSrc(): string[] {
  if (!isSupabasePublicCredentialsConfigured()) return [];
  return [new URL(parseSupabasePublicCredentials().NEXT_PUBLIC_SUPABASE_URL).origin];
}

/**
 * Runbook Step 37 follow-up: the browser Meta Pixel needs to load
 * `https://connect.facebook.net/en_US/fbevents.js` (script-src) and send
 * its own tracking calls to `connect.facebook.net` (connect-src) — allowed
 * only under the same condition `meta-pixel.ts#resolveMetaPixelId` requires
 * before ever rendering the bootstrap script (`FEATURE_META_MARKETING` on,
 * `META_PIXEL_ID` configured), so an unconfigured/disabled environment's
 * CSP is unaffected. Per-guest consent is a separate, per-request gate
 * enforced at render time (`[locale]/layout.tsx`) — CSP itself is a single
 * static policy with no per-request session access, so it can only ever
 * express "this domain may be used at all," not "this specific guest
 * consented."
 */
function metaPixelDomainsAllowed(): boolean {
  return isFeatureEnabled('FEATURE_META_MARKETING') && Boolean(parseMetaPixelId());
}
function metaConnectSrc(): string[] {
  return metaPixelDomainsAllowed() ? ['https://connect.facebook.net'] : [];
}
function metaScriptSrc(): string[] {
  return metaPixelDomainsAllowed() ? ['https://connect.facebook.net'] : [];
}

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    if (isDev) return [];
    const headers = securityHeaders({
      connectSrc: [...supabaseConnectSrc(), ...metaConnectSrc()],
      scriptSrc: metaScriptSrc(),
    });
    return [
      {
        source: '/:path*',
        headers: Object.entries(headers).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
