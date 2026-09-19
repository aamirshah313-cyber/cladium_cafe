/**
 * Takeaway cart and review page.
 *
 * ## Gated by both switches, and it 404s rather than explaining itself
 *
 * `FEATURE_TAKEAWAY_REQUESTS` says the takeaway API and staff side are on.
 * `TAKEAWAY_GUEST_JOURNEY_COMPLETE` says the guest-facing journey is
 * verified end to end — including that a submitted request actually reaches
 * staff. Both must be true, exactly as on `menu/page.tsx`.
 *
 * When either is false this is `notFound()`, not a "coming soon" panel. A
 * page that exists and explains it is unavailable is still an invitation,
 * and the menu carousel already hides its add control behind the same
 * constant, so nothing links here in that state — a reachable page would
 * only be found by someone typing the URL, and the honest answer to them is
 * that there is nothing here yet.
 *
 * `TAKEAWAY_GUEST_JOURNEY_COMPLETE` is deliberately still `false`. The cart
 * is finished, but the outbox dispatcher is not delivering (see the P0 item
 * in `.continuum/TASKS.md`, verified 9 Sep 2026), so a submitted request
 * would sit durable and unseen. Turning this on before delivery is proven
 * would let guests send orders nobody is notified of.
 *
 * ## Dynamic, like every other request surface
 *
 * The cart belongs to the caller's own session and is read client-side from
 * `GET /api/takeaway/cart`; nothing about it is cacheable or shared, and the
 * server renders only the frame.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale, type Locale } from '../../../lib/i18n/locale';
import { localePageMetadata } from '../../../lib/i18n/metadata';
import { isFeatureEnabled } from '../../../lib/env.server';
import { TAKEAWAY_GUEST_JOURNEY_COMPLETE } from '../../../modules/takeaway/guest-journey';
import { TakeawayCart } from './takeaway-cart';

export const dynamic = 'force-dynamic';

function journeyAvailable(): boolean {
  return isFeatureEnabled('FEATURE_TAKEAWAY_REQUESTS') && TAKEAWAY_GUEST_JOURNEY_COMPLETE;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) return {};
  // No metadata for a route that does not exist in this configuration —
  // otherwise a disabled journey still advertises itself to a crawler.
  if (!journeyAvailable()) return {};
  return localePageMetadata(
    rawLocale,
    '/takeaway',
    'takeawayPageHeading',
    'takeawayMetaDescription',
  );
}

export default async function TakeawayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  if (!journeyAvailable()) notFound();
  const locale: Locale = rawLocale;

  return (
    <div>
      <div className="page-header">
        <h1>{chromeText('takeawayPageHeading', locale)}</h1>
        <p className="u-lede">{chromeText('takeawayPageLede', locale)}</p>
      </div>
      <TakeawayCart locale={locale} />
    </div>
  );
}
