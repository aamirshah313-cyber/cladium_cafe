/**
 * Root fallback redirect — Runbook Step 13.
 *
 * `proxy.ts` already negotiates a locale for a bare `/` and redirects there
 * before routing, so this should not normally render. It exists as a
 * defense-in-depth fallback for any request path that reaches the root route
 * segment without having passed through the proxy (e.g. a prefetch or an
 * internal Next.js request class the proxy does not intercept), so `/` can
 * never resolve to a 404 or an unlocalized page instead of redirecting to
 * the default locale. Lives in the `(root-fallback)` route group so its
 * layout's `<html>` tag never nests above `app/[locale]/layout.tsx`'s — see
 * that layout's doc comment.
 */

import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE } from '../../lib/i18n/locale';

export default function RootPage(): never {
  redirect(`/${DEFAULT_LOCALE}`);
}
