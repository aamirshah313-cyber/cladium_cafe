import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security/headers';

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
 */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    if (isDev) return [];
    const headers = securityHeaders();
    return [
      {
        source: '/:path*',
        headers: Object.entries(headers).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
