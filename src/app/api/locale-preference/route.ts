/**
 * Locale preference endpoint — Runbook Step 13.
 *
 * A plain GET link, so the language switcher
 * (`app/[locale]/language-switcher.tsx`) works with no JavaScript: the
 * browser navigates here, the signed preference cookie is set, and the
 * response redirects to the equivalent page in the chosen locale. All
 * decision logic lives in `lib/i18n/request-locale.ts`'s
 * `buildLocalePreferenceRedirect`, which is unit-tested directly; this file
 * is only Next.js glue.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildLocalePreferenceRedirect } from '../../../lib/i18n/request-locale';

export function GET(request: NextRequest): NextResponse {
  const url = new URL(request.url);
  const { target, setCookieHeader } = buildLocalePreferenceRedirect({
    requestedLocale: url.searchParams.get('to'),
    requestedPath: url.searchParams.get('path'),
    secure: request.nextUrl.protocol === 'https:',
  });

  const response = NextResponse.redirect(new URL(target, request.url));
  if (setCookieHeader) response.headers.append('Set-Cookie', setCookieHeader);
  return response;
}
