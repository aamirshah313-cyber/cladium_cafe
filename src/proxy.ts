/**
 * Root-only locale negotiation, plus a real 404 status for unmatched
 * locale-prefixed paths — Runbook Step 13, extended Step 45 (D-058).
 *
 * A bare `/` negotiates a locale (`lib/i18n/request-locale.ts` — verified
 * signed preference cookie first, then `Accept-Language`, then
 * `DEFAULT_LOCALE`) and redirects there. `negotiateLocale` only ever returns
 * a member of `LOCALES`, so this can never produce an open redirect
 * regardless of cookie or header content.
 *
 * Uses Next.js 16's `proxy` convention (replacing deprecated `middleware.ts`)
 * because it runs on the Node.js runtime, not Edge — verifying the signed
 * cookie needs `node:crypto`.
 *
 * The 404 fix (Step 39/45, D-058): `[locale]/loading.tsx` wraps every page
 * under `[locale]/*` in a Suspense boundary, including the catch-all
 * `[...rest]/page.tsx` — Next.js starts streaming a `200` status before that
 * boundary resolves and discovers `notFound()` was called, and the status
 * can never change once streaming has begun (a documented, currently
 * unfixed Next.js App Router limitation — confirmed via the team's own
 * unanswered GitHub discussion, not guessed). The only real fix runs
 * *before* any rendering starts: here, at the proxy layer. `KNOWN_LOCALE_PAGES`
 * is the one, single source of truth for "what page actually exists under
 * `[locale]/*`" — `tests/unit/proxy-known-pages.test.ts` fails CI the moment
 * this list drifts from the real `src/app/[locale]/` directory listing, so
 * adding a new page and forgetting to update this list is caught
 * immediately, not silently. An unsupported *locale* (e.g. `/fr`) already
 * 404s correctly without this fix — `[locale]/page.tsx`'s own
 * `isSupportedLocale` check is outside the broken code path; this only
 * covers a *valid* locale with an unmatched sub-path.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { negotiateRequestLocale } from './lib/i18n/request-locale';
import { LOCALES } from './lib/i18n/locale';
import { isFeatureEnabled } from './lib/env.server';
import { TAKEAWAY_GUEST_JOURNEY_COMPLETE } from './modules/takeaway/guest-journey';

/** Every real page directory under `src/app/[locale]/`, except the catch-all itself. Keep in sync — the test above enforces it. */
export const KNOWN_LOCALE_PAGES: ReadonlySet<string> = new Set([
  'book',
  'concierge',
  'event',
  'menu',
  'privacy',
  'takeaway',
  'visit',
]);

/**
 * Pages whose directory exists but which are only *reachable* when a runtime
 * gate is on. Keyed by the same segment name as `KNOWN_LOCALE_PAGES`, which
 * stays the structural list so its drift test keeps doing its job.
 *
 * This exists because the streaming problem above is worse for a gated page,
 * not better. `[locale]/loading.tsx` means a `notFound()` inside the page
 * streams a `200` before the boundary resolves — so a switched-off journey
 * would answer `200 OK` with not-found content, and a crawler would index a
 * page that is deliberately unavailable. Deciding it here, before rendering
 * starts, is the only place the status can still be set.
 *
 * The page keeps its own `notFound()` too. This layer gets the status right;
 * that one stays correct if the route is ever reached without the proxy.
 */
const CONDITIONAL_LOCALE_PAGES: Readonly<Record<string, () => boolean>> = {
  takeaway: () => isFeatureEnabled('FEATURE_TAKEAWAY_REQUESTS') && TAKEAWAY_GUEST_JOURNEY_COMPLETE,
};

const LOCALE_SUBPATH_PATTERN = new RegExp(`^/(${LOCALES.join('|')})/(.+)$`);

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    const locale = negotiateRequestLocale({
      headers: request.headers,
      acceptLanguageHeader: request.headers.get('accept-language'),
    });
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  const match = pathname.match(LOCALE_SUBPATH_PATTERN);
  if (match) {
    const rest = match[2] ?? '';
    const [firstSegment, ...remainingSegments] = rest.split('/');
    const segment = firstSegment ?? '';
    const isKnownPage =
      remainingSegments.length === 0 &&
      KNOWN_LOCALE_PAGES.has(segment) &&
      // A gated page is only "known" while its gate is on. Everything else
      // has no entry here and is unconditionally known.
      (CONDITIONAL_LOCALE_PAGES[segment]?.() ?? true);
    if (!isKnownPage) {
      // Self-rewrite: same URL, same rendering (the catch-all's own
      // notFound() content is already correct — Step 39 verified that),
      // only the status header changes, set here before streaming starts.
      return NextResponse.rewrite(request.nextUrl, { status: 404 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/(en|ur)/:path*'],
};
