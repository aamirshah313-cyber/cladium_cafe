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

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale, type Locale } from '../../../lib/i18n/locale';
import { localePageMetadata } from '../../../lib/i18n/metadata';
import { formatPkr } from '../../../lib/business/money';
import { buildWhatsAppUrl } from '../../../lib/business/whatsapp-link';
import { isFeatureEnabled } from '../../../lib/env.server';
import { filterMenuCategories, getPublishedMenuView } from '../../../modules/menu/menu-view';
import { availabilityChromeKey } from '../../../modules/menu/availability-chrome-key';
import { TAKEAWAY_GUEST_JOURNEY_COMPLETE } from '../../../modules/takeaway/guest-journey';
import { MenuViewTracker } from './menu-view-tracker';
import { TrackedWhatsAppLink } from '../tracked-whatsapp-link';
import { MenuFeatureCarousel } from './menu-feature-carousel';

export const dynamic = 'force-dynamic';

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

interface MenuPageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) return {};
  return localePageMetadata(rawLocale, '/menu', 'navMenuLabel', 'menuMetaDescription');
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
        <div className="page-header">
          <h1>{chromeText('navMenuLabel', locale)}</h1>
        </div>
        {/*
         * The honest "not published yet" state, styled as a real panel
         * rather than left as unstyled text. It offers the two routes that
         * genuinely work in this state — ask on WhatsApp, or come in — and
         * never substitutes a cached or draft menu to fill the space.
         */}
        <div className="panel">
          <h2>{chromeText('menuUnpublishedHeading', locale)}</h2>
          <p>{chromeText('menuUnpublishedBody', locale)}</p>
          <div className="form-actions">
            <TrackedWhatsAppLink
              href={buildWhatsAppUrl(locale)}
              eventSourceUrl={`/${locale}/menu`}
              className="u-button u-button--primary"
            >
              {chromeText('whatsappCtaLabel', locale)}
            </TrackedWhatsAppLink>
            <a href={`/${locale}/visit`} className="u-button u-button--secondary">
              {chromeText('navVisitLabel', locale)}
            </a>
          </div>
          <p className="field-hint">{chromeText('whatsappExternalNoticeText', locale)}</p>
        </div>
      </div>
    );
  }

  /*
   * Both conditions, not either. The flag says the takeaway API is switched
   * on (it is, in the deployed environment); the constant says a guest has
   * somewhere to go after adding an item (they do not — the cart/review
   * page is not built). Offering the add control on the flag alone is what
   * produces the dead end, so the affordance waits for the destination.
   * See `modules/takeaway/guest-journey.ts`.
   */
  const takeawayEnabled =
    isFeatureEnabled('FEATURE_TAKEAWAY_REQUESTS') && TAKEAWAY_GUEST_JOURNEY_COMPLETE;

  const rawParams = await searchParams;
  const query = firstString(rawParams.q);
  const categoryId = firstString(rawParams.category);
  const filtered = filterMenuCategories(view.categories, { query, categoryId });

  return (
    <div>
      <MenuViewTracker path={`/${locale}/menu`} />
      <div className="page-header">
        <h1>{chromeText('navMenuLabel', locale)}</h1>
        <p className="u-lede">{chromeText('menuPageLede', locale)}</p>
      </div>

      <MenuFeatureCarousel
        categories={view.categories}
        takeawayEnabled={takeawayEnabled}
        locale={locale}
      />

      {/*
       * A plain GET form, so search and filtering keep working without
       * JavaScript and the result stays a real, linkable URL — which is
       * also what lets the language switcher carry `q`/`category` across a
       * locale change.
       */}
      <form method="GET" className="menu-filters" role="search">
        <div className="field">
          <label htmlFor="menu-search-input">{chromeText('menuSearchLabel', locale)}</label>
          <input id="menu-search-input" type="search" name="q" defaultValue={query ?? ''} />
        </div>

        <div className="field">
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
        </div>

        <button type="submit" className="u-button u-button--primary">
          {chromeText('menuSearchButtonLabel', locale)}
        </button>
      </form>

      {filtered.length === 0 ? (
        <div className="state-block">
          <p className="u-lede">{chromeText('menuNoResultsText', locale)}</p>
          <div className="form-actions state-actions">
            <a href={`/${locale}/menu`} className="u-button u-button--secondary">
              {chromeText('menuAllCategoriesLabel', locale)}
            </a>
          </div>
        </div>
      ) : (
        filtered.map((category) => (
          <section
            key={category.id}
            className="menu-category"
            aria-labelledby={`menu-category-${category.id}`}
          >
            <h2 id={`menu-category-${category.id}`} className="menu-category-heading">
              {category.name}
            </h2>
            <ul className="menu-items">
              {category.items.map((item) => (
                <li key={item.id} className="menu-item">
                  <div className="menu-item-head">
                    <span className="menu-item-name">
                      {item.name}
                      {item.groupLabel ? (
                        <span className="menu-item-group"> ({item.groupLabel})</span>
                      ) : null}
                    </span>
                    {/* A leader rule between name and price, so a long name
                        and its amount stay visually connected across the row. */}
                    <span className="menu-item-leader" aria-hidden="true" />
                    {item.basePricePkr !== null ? (
                      <span className="menu-item-price">{formatPkr(item.basePricePkr)}</span>
                    ) : null}
                  </div>
                  <p className="menu-item-availability">
                    {chromeText(availabilityChromeKey(item.availability), locale)}
                  </p>
                  {item.variants.length > 0 ? (
                    <ul className="menu-variants">
                      {item.variants.map((variant) => (
                        <li key={variant.id}>
                          <span>{variant.label}</span>
                          <span className="menu-item-leader" aria-hidden="true" />
                          <span className="menu-item-price">{formatPkr(variant.pricePkr)}</span>
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
