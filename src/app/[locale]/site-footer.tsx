/**
 * Site footer — Runbook Step 15, developed into the real closing surface.
 *
 * Contains only verified facts: the supplied crest and its retained
 * tagline, the confirmed hours/address, the configured WhatsApp number, the
 * two official social profiles opened and confirmed during the design audit
 * (`modules/business/facts.ts`), real page links, and the Privacy/consent
 * page.
 *
 * Deliberately absent, because none of it is approved and inventing it to
 * fill a column would be a business-facts violation, not a design choice:
 * an email address, a terms page, a second phone number, ratings, review
 * counts, awards, certifications, delivery, and any "as featured in" line.
 * The Privacy link is the one legal-ish destination, and it is an honest
 * "not published yet" notice with working consent controls rather than
 * placeholder legal text.
 *
 * The WhatsApp link goes through `buildWhatsAppUrl` so it keeps the same
 * reviewed, non-sensitive prefilled message and external-navigation
 * treatment the rest of the site uses.
 */

import Image from 'next/image';
import Link from 'next/link';
import { BRAND_NAME, TAGLINE, chromeText } from '../../lib/i18n/chrome';
import { buildWhatsAppUrl } from '../../lib/business/whatsapp-link';
import { isOpenAt } from '../../lib/business/hours';
import type { Locale } from '../../lib/i18n/locale';
import { brandLogo } from '../../modules/brand/asset-manifest';
import {
  ADDRESS_DISPLAY,
  BUSINESS_HOURS_DISPLAY,
  FACEBOOK_URL,
  GOOGLE_MAPS_URL,
  INSTAGRAM_URL,
  WHATSAPP_DISPLAY,
} from '../../modules/business/facts';

interface SiteFooterProps {
  readonly locale: Locale;
}

const PAGE_LINKS = [
  { path: '/menu', labelKey: 'navMenuLabel' },
  { path: '/book', labelKey: 'navBookLabel' },
  { path: '/event', labelKey: 'navPlanBirthdayLabel' },
  { path: '/visit', labelKey: 'navVisitLabel' },
  { path: '/concierge', labelKey: 'navConciergeLabel' },
] as const;

export function SiteFooter({ locale }: SiteFooterProps) {
  const open = isOpenAt(new Date());
  const statusKey = open ? 'statusOpenNow' : 'statusClosedNow';

  return (
    <footer className="site-footer">
      <div className="u-container">
        <div className="site-footer-grid">
          <div>
            <Image
              src={brandLogo.large.path}
              alt={BRAND_NAME}
              width={brandLogo.large.width}
              height={brandLogo.large.height}
              className="site-footer-brand-mark"
              loading="lazy"
            />
            <p className="site-footer-tagline">{TAGLINE}</p>
          </div>

          <nav aria-label={chromeText('footerExploreLabel', locale)}>
            <h2>{chromeText('footerExploreLabel', locale)}</h2>
            <ul className="site-footer-links">
              {PAGE_LINKS.map((item) => (
                <li key={item.path}>
                  <Link href={`/${locale}${item.path}`}>{chromeText(item.labelKey, locale)}</Link>
                </li>
              ))}
              <li>
                <Link href={`/${locale}/privacy`}>{chromeText('navPrivacyLabel', locale)}</Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2>{chromeText('footerVisitLabel', locale)}</h2>
            <p>{ADDRESS_DISPLAY}</p>
            <p>
              {chromeText('hoursLabel', locale)}: {BUSINESS_HOURS_DISPLAY} ·{' '}
              {chromeText(statusKey, locale)}
            </p>
            <ul className="site-footer-links">
              <li>
                <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer">
                  {chromeText('footerDirectionsLinkLabel', locale)}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2>{chromeText('footerContactLabel', locale)}</h2>
            <ul className="site-footer-links">
              <li>
                <a href={buildWhatsAppUrl(locale)} target="_blank" rel="noopener noreferrer">
                  WhatsApp: {WHATSAPP_DISPLAY}
                </a>
              </li>
            </ul>
            <div className="site-footer-social">
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
              <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
                Facebook
              </a>
            </div>
          </div>
        </div>

        <p className="site-footer-bottom">
          © {new Date().getFullYear()} {BRAND_NAME}
        </p>
      </div>
    </footer>
  );
}
