/**
 * Root-only locale negotiation proxy — Runbook Step 13.
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
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { negotiateRequestLocale } from './lib/i18n/request-locale';

export function proxy(request: NextRequest): NextResponse {
  const locale = negotiateRequestLocale({
    headers: request.headers,
    acceptLanguageHeader: request.headers.get('accept-language'),
  });

  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

export const config = {
  matcher: '/',
};
