'use client';

/**
 * Primary navigation — Runbook Steps 16–17.
 *
 * A small client island, isolated from the rest of `SiteHeader` (a Server
 * Component), purely so `aria-current="page"` can reflect the *actual*
 * current path via `usePathname()`. `[locale]/layout.tsx` only receives the
 * locale segment, not the full pathname, so a Server Component here would
 * have had to guess — the same gap Step 15 flagged when there was only one
 * nav item to get wrong.
 *
 * Order matches `design/site-map.md`'s top-level nodes (Home, Menu, Visit,
 * Concierge), with `/event` inserted after Menu — the site map lists
 * décor enquiries as a Home-page CTA rather than its own top-level node,
 * but Steps 22–23 need it reachable from every page, not just Home.
 *
 * `/book` is deliberately **not** listed here. It was appearing twice in
 * the same header row — once as a nav link and again as the primary
 * "Request a Table" button immediately beside it — which is what made the
 * desktop composition read as cluttered. The route is not hidden: the
 * button is the more prominent of the two, is present at every width
 * including inside the drawer, and is the one carrying the request-accurate
 * label. Removing the quieter duplicate loses no destination. Menu is included even though it currently renders an
 * honest "not published yet" state (`menu/page.tsx`) rather than being
 * hidden — it is a real, working route, not an unbuilt one. Concierge
 * (Step 28) is last, matching the site map's own top-level ordering.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { chromeText, type ChromeKey } from '../../lib/i18n/chrome';
import type { Locale } from '../../lib/i18n/locale';

interface NavItem {
  /** Appended to `/${locale}`; '' means the locale root itself. */
  readonly path: string;
  readonly labelKey: ChromeKey;
}

const ITEMS: readonly NavItem[] = [
  { path: '', labelKey: 'navHomeLabel' },
  { path: '/menu', labelKey: 'navMenuLabel' },
  { path: '/event', labelKey: 'navPlanBirthdayLabel' },
  { path: '/visit', labelKey: 'navVisitLabel' },
  { path: '/concierge', labelKey: 'navConciergeLabel' },
];

interface PrimaryNavProps {
  readonly locale: Locale;
}

export function PrimaryNav({ locale }: PrimaryNavProps) {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label={chromeText('primaryNavLabel', locale)}>
      <ul>
        {ITEMS.map((item) => {
          const href = `/${locale}${item.path}`;
          return (
            <li key={href}>
              <Link href={href} aria-current={pathname === href ? 'page' : undefined}>
                {chromeText(item.labelKey, locale)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
