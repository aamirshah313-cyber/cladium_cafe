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
 * Concierge). Menu is included even though it currently renders an honest
 * "not published yet" state (`menu/page.tsx`) rather than being hidden —
 * it is a real, working route, not an unbuilt one.
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
  { path: '/visit', labelKey: 'navVisitLabel' },
];

interface PrimaryNavProps {
  readonly locale: Locale;
}

export function PrimaryNav({ locale }: PrimaryNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={chromeText('primaryNavLabel', locale)}>
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
