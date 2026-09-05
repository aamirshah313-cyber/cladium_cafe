/**
 * Menu page — Runbook Step 17/19.
 *
 * `getPublishedMenuView()` now reads real Postgres rows through an
 * RLS-bound anon client (`guest-view-repository.ts`) — with zero published
 * versions this still correctly returns `UNPUBLISHED`, showing an honest
 * "not available online yet" state with a WhatsApp/Visit fallback, never
 * a draft or unapproved item list. The `PUBLISHED` branch below is the
 * same one already verified live against fixture data (see
 * `.continuum/DECISIONS.md`); nothing here needed to change to make it
 * real.
 *
 * `dynamic = 'force-dynamic'` is documentation/defense-in-depth, not a
 * behavior change: `app/[locale]/layout.tsx` already calls `cookies()` for
 * theme (D-019), which forces this whole subtree dynamic — so a real
 * per-request DB read here was already guaranteed fresh, with no caching
 * layer that could leave a guest seeing a stale menu after a publish.
 *
 * Search/category filtering is a plain `<form method="GET">` reading
 * `searchParams` server-side — full functionality with no JavaScript at
 * all, not a no-JS fallback for a JS-first design.
 *
 * Step 37: `MenuViewTracker` fires the consent/flag-gated `view_menu` Meta
 * event once per visit, in both branches — visiting the route is the
 * signal, regardless of publish state.
 */

import { notFound } from 'next/navigation';
import { chromeText, type ChromeKey } from '../../../lib/i18n/chrome';
import { isSupportedLocale, type Locale } from '../../../lib/i18n/locale';
import { formatPkr } from '../../../lib/business/money';
import { buildWhatsAppUrl } from '../../../lib/business/whatsapp-link';
import type { AvailabilityStatus } from '../../../lib/schemas/common';
import { filterMenuCategories, getPublishedMenuView } from '../../../modules/menu/menu-view';
import { MenuViewTracker } from './menu-view-tracker';
import { TrackedWhatsAppLink } from '../tracked-whatsapp-link';

export const dynamic = 'force-dynamic';

function availabilityChromeKey(status: AvailabilityStatus): ChromeKey {
  switch (status) {
    case 'AVAILABLE':
      return 'availabilityAvailable';
    case 'UNAVAILABLE':
      return 'availabilityUnavailable';
    case 'UNKNOWN':
      return 'availabilityUnknown';
  }
}

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

interface MenuPageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MenuPage({ params, searchParams }: MenuPageProps) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;

  const view = await getPublishedMenuView();

  if (view.status === 'UNPUBLISHED') {
    return (
      <div>
        <MenuViewTracker path={`/${locale}/menu`} />
        <h1>{chromeText('navMenuLabel', locale)}</h1>
        <p>{chromeText('menuUnpublishedHeading', locale)}</p>
        <p>{chromeText('menuUnpublishedBody', locale)}</p>
        <p>
          <TrackedWhatsAppLink href={buildWhatsAppUrl(locale)} eventSourceUrl={`/${locale}/menu`}>
            {chromeText('whatsappCtaLabel', locale)}
          </TrackedWhatsAppLink>
          <br />
          <small>{chromeText('whatsappExternalNoticeText', locale)}</small>
        </p>
        <p>
          <a href={`/${locale}/visit`}>{chromeText('navVisitLabel', locale)}</a>
        </p>
      </div>
    );
  }

  const rawParams = await searchParams;
  const query = firstString(rawParams.q);
  const categoryId = firstString(rawParams.category);
  const filtered = filterMenuCategories(view.categories, { query, categoryId });

  return (
    <div>
      <MenuViewTracker path={`/${locale}/menu`} />
      <h1>{chromeText('navMenuLabel', locale)}</h1>

      <form method="GET">
        <label htmlFor="menu-search-input">{chromeText('menuSearchLabel', locale)}</label>
        <input id="menu-search-input" type="search" name="q" defaultValue={query ?? ''} />

        <label htmlFor="menu-category-select">
          {chromeText('menuCategoryFilterLabel', locale)}
        </label>
        <select id="menu-category-select" name="category" defaultValue={categoryId ?? ''}>
          <option value="">{chromeText('menuAllCategoriesLabel', locale)}</option>
          {view.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <button type="submit">{chromeText('menuSearchButtonLabel', locale)}</button>
      </form>

      {filtered.length === 0 ? (
        <p>{chromeText('menuNoResultsText', locale)}</p>
      ) : (
        filtered.map((category) => (
          <section key={category.id} aria-labelledby={`menu-category-${category.id}`}>
            <h2 id={`menu-category-${category.id}`}>{category.name}</h2>
            <ul>
              {category.items.map((item) => (
                <li key={item.id}>
                  <span>{item.name}</span>
                  {item.groupLabel ? <span> ({item.groupLabel})</span> : null}
                  {item.basePricePkr !== null ? (
                    <span> — {formatPkr(item.basePricePkr)}</span>
                  ) : null}
                  <span> · {chromeText(availabilityChromeKey(item.availability), locale)}</span>
                  {item.variants.length > 0 ? (
                    <ul>
                      {item.variants.map((variant) => (
                        <li key={variant.id}>
                          {variant.label} — {formatPkr(variant.pricePkr)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
