/**
 * Home page — Runbook Step 16, rebuilt as the real arrival experience.
 *
 * Composition, in order: a photographic hero built on the one authentic
 * venue photograph, a short place/story section, the two seating and
 * celebration experiences, an honest category-led dining teaser, a visit
 * teaser, and a closing request/WhatsApp invitation.
 *
 * **There is deliberately no gallery.** Exactly one real venue photograph
 * exists. Repeating it across six cards to simulate one would be inventing
 * an impression of the place, so the page runs fewer, stronger sections
 * instead — and the small category crops (176–235px wide, mostly) appear at
 * genuinely small sizes with an honest caption saying they show a category
 * rather than a specific dish.
 *
 * Copy comes only from approved sources: bilingual chrome (`chromeText`),
 * confirmed operational facts (`modules/business/facts.ts`), and the
 * redesign's own editorial prose (`modules/business/site-copy.ts`), which
 * is constrained to what the photograph shows and what is already
 * confirmed. Urdu falls back to canonical English with correct `lang`/`dir`
 * markup via `LocalizedProse` — never a machine translation.
 *
 * The CTAs stay request-accurate (CLAUDE.md): a table is *requested*, the
 * treehouse is *requested* and staff-confirmed, and nothing on this page
 * says confirmed, available, or booked.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BRAND_NAME, TAGLINE, chromeText } from '../../lib/i18n/chrome';
import { isSupportedLocale } from '../../lib/i18n/locale';
import { buildWhatsAppUrl } from '../../lib/business/whatsapp-link';
import { venueHero, venueHeroBlurPath } from '../../modules/brand/asset-manifest';
import {
  ADDRESS_DISPLAY,
  BUSINESS_HOURS_DISPLAY,
  BIRTHDAY_POLICY_TEXT,
  DIRECTIONS_TEXT,
  GOOGLE_MAPS_URL,
  SEATING_POLICY_TEXT,
} from '../../modules/business/facts';
import {
  HOME_CLOSING_TEXT,
  HOME_DINING_TEXT,
  HOME_PLACE_TEXT,
  HOME_SEATING_TEXT,
} from '../../modules/business/site-copy';
import { LocalizedProse } from './localized-prose';
import { TrackedWhatsAppLink } from './tracked-whatsapp-link';

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  return (
    <>
      {/*
       * The hero is the page's LCP element. The tiny blurred derivative is
       * painted as the section's own background so the area is filled with
       * the photograph's actual colours immediately, rather than flashing
       * empty while the full image arrives. The heading and both actions
       * are real DOM from the first byte — nothing here waits on
       * JavaScript to become visible.
       */}
      <section
        className="u-bleed home-hero"
        style={{ backgroundImage: `url(${venueHeroBlurPath})` }}
      >
        {/*
         * A real `<picture>` rather than `next/image`, because this needs
         * *art direction*, not just resizing: the source photograph is
         * portrait, and a landscape crop of it loses the timber pavilion
         * almost entirely on a narrow screen — confirmed by rendering it,
         * not assumed. Phones therefore get the portrait crop and wider
         * screens the landscape one, which is a different picture of the
         * same scene, something `sizes`/`srcset` alone cannot express.
         *
         * The derivatives are already generated at the right dimensions and
         * encoded as WebP (`modules/brand/asset-manifest.ts`), so the
         * optimizer would have little left to do. `fetchPriority="high"`
         * keeps it the prioritised LCP fetch, and explicit `width`/`height`
         * reserve the box so nothing shifts as it arrives.
         */}
        <picture>
          <source
            media="(max-width: 767px)"
            srcSet={venueHero.portrait.path}
            width={venueHero.portrait.width}
            height={venueHero.portrait.height}
          />
          <source
            media="(min-width: 768px)"
            srcSet={`${venueHero.wideSmall.path} 1280w, ${venueHero.wide.path} 1920w`}
            sizes="100vw"
          />
          <img
            src={venueHero.wide.path}
            alt={venueHero.wide.alt}
            width={venueHero.wide.width}
            height={venueHero.wide.height}
            className="home-hero-image"
            style={{ objectPosition: venueHero.wide.focalPoint }}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="home-hero-scrim" aria-hidden="true" />
        <div className="u-container home-hero-content">
          <p className="home-hero-tagline">{TAGLINE}</p>
          <h1 className="home-hero-title">{BRAND_NAME}</h1>
          <p className="home-hero-intro">{chromeText('homeIntro', locale)}</p>
          <div className="home-hero-actions">
            <Link href={`/${locale}/menu`} className="u-button u-button--primary">
              {chromeText('homeExploreMenuCtaLabel', locale)}
            </Link>
            <Link href={`/${locale}/book`} className="u-button u-button--on-image">
              {chromeText('navBookLabel', locale)}
            </Link>
          </div>
        </div>
      </section>

      <section className="u-section home-place">
        <h2>{chromeText('homePlaceHeading', locale)}</h2>
        <LocalizedProse text={HOME_PLACE_TEXT} locale={locale} className="u-lede" />
      </section>

      <section className="u-section">
        <h2>{chromeText('homeExperiencesHeading', locale)}</h2>
        <div className="home-cards">
          <article className="home-card">
            <h3>{chromeText('homeSeatingHeading', locale)}</h3>
            <LocalizedProse text={HOME_SEATING_TEXT} locale={locale} />
            {/* The approved operational wording, kept verbatim beside the
                editorial framing so the limit is never softened. */}
            <LocalizedProse text={SEATING_POLICY_TEXT} locale={locale} className="u-muted" />
            <div className="home-card-actions">
              <Link href={`/${locale}/book`} className="u-button u-button--primary">
                {chromeText('navBookLabel', locale)}
              </Link>
              <Link
                href={`/${locale}/book?seating=treehouse`}
                className="u-button u-button--secondary"
              >
                {chromeText('treehouseSeatingCtaLabel', locale)}
              </Link>
            </div>
          </article>

          <article className="home-card">
            <h3>{chromeText('homeCelebrationsHeading', locale)}</h3>
            {/* Décor pricing and the staff-confirmation requirement come
                straight from approved operations knowledge — never
                restated as a package, an inclusion, or a final quote. */}
            <LocalizedProse text={BIRTHDAY_POLICY_TEXT} locale={locale} />
            <div className="home-card-actions">
              <Link href={`/${locale}/event`} className="u-button u-button--primary">
                {chromeText('navPlanBirthdayLabel', locale)}
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="u-section">
        <h2>{chromeText('homeDiningHeading', locale)}</h2>
        <LocalizedProse text={HOME_DINING_TEXT} locale={locale} className="u-lede" />
        <p className="u-muted home-dining-caption">{chromeText('homeDiningCaption', locale)}</p>
        <div className="home-card-actions">
          <Link href={`/${locale}/menu`} className="u-button u-button--primary">
            {chromeText('homeExploreMenuCtaLabel', locale)}
          </Link>
        </div>
      </section>

      <section className="u-section home-visit">
        <h2>{chromeText('homeVisitHeading', locale)}</h2>
        <LocalizedProse text={DIRECTIONS_TEXT} locale={locale} />
        <dl className="home-facts">
          <div>
            <dt>{chromeText('addressHeading', locale)}</dt>
            <dd>{ADDRESS_DISPLAY}</dd>
          </div>
          <div>
            <dt>{chromeText('hoursLabel', locale)}</dt>
            <dd>{BUSINESS_HOURS_DISPLAY}</dd>
          </div>
        </dl>
        <div className="home-card-actions">
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="u-button u-button--secondary"
          >
            {chromeText('mapCtaLabel', locale)}
          </a>
          <Link href={`/${locale}/visit`} className="u-button u-button--secondary">
            {chromeText('homeVisitCtaLabel', locale)}
          </Link>
        </div>
      </section>

      <section className="u-section home-closing">
        <h2>{chromeText('homeClosingHeading', locale)}</h2>
        <LocalizedProse text={HOME_CLOSING_TEXT} locale={locale} className="u-lede" />
        <div className="home-card-actions">
          <Link href={`/${locale}/book`} className="u-button u-button--primary">
            {chromeText('navBookLabel', locale)}
          </Link>
          <Link href={`/${locale}/concierge`} className="u-button u-button--secondary">
            {chromeText('navConciergeLabel', locale)}
          </Link>
        </div>
        <p className="home-whatsapp">
          <TrackedWhatsAppLink href={buildWhatsAppUrl(locale)} eventSourceUrl={`/${locale}`}>
            {chromeText('whatsappCtaLabel', locale)}
          </TrackedWhatsAppLink>
          <br />
          <small className="u-muted">{chromeText('whatsappExternalNoticeText', locale)}</small>
        </p>
      </section>
    </>
  );
}
