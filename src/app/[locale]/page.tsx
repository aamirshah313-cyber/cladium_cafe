/**
 * Home page — Runbook Step 16, rebuilt as the real arrival experience.
 *
 * Composition, in order: a photographic hero built on the one authentic
 * venue photograph, a short place/story section, the two seating and
 * celebration experiences, an honest category-led dining teaser, a visit
 * teaser, and a closing request/WhatsApp invitation.
 *
 * **The gallery is real now.** It could not be built before, when exactly
 * one venue photograph existed — repeating that one image across six cards
 * to simulate a gallery would have invented an impression of the place. The
 * September 2026 shoot supplies genuinely distinct scenes
 * (`modules/brand/media-manifest.ts`), so six of them are shown, each once.
 * It is still not padded to a rounder number: a gallery that repeats one
 * subject is telling the visitor there is more to see than there is.
 *
 * Photographs appear at or below their real pixel sizes throughout. The
 * sources are around 335–415px wide, which is ample for the sizes used here
 * and nowhere near enough to go full-bleed — so they do not.
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
import { diningMedia, galleryMedia, venueMedia } from '../../modules/brand/media-manifest';
import {
  ADDRESS_DISPLAY,
  BUSINESS_HOURS_DISPLAY,
  BIRTHDAY_POLICY_TEXT,
  DIRECTIONS_TEXT,
  GOOGLE_MAPS_URL,
} from '../../modules/business/facts';
import {
  HOME_CLOSING_TEXT,
  HOME_DINING_TEXT,
  HOME_PLACE_TEXT,
  HOME_SEATING_TEXT,
} from '../../modules/business/site-copy';
import { LocalizedProse } from './localized-prose';
import { PhotoGrid, SitePhoto } from './site-photo';
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

      {/*
       * The story section, paired with a portrait of the pavilion seen
       * through the trees — the same subject the copy describes, so the
       * picture is evidence for the text rather than decoration beside it.
       * It is marked decorative for assistive technology because the prose
       * immediately next to it already says what the photograph shows.
       */}
      <section className="u-section home-place">
        <div className="home-story">
          <div className="home-story-copy">
            <h2>{chromeText('homePlaceHeading', locale)}</h2>
            <LocalizedProse text={HOME_PLACE_TEXT} locale={locale} className="u-lede" />
          </div>
          <SitePhoto
            asset={venueMedia.pavilionThroughTrees}
            className="home-story-photo"
            decorative
          />
        </div>
      </section>

      <section className="u-section">
        <h2>{chromeText('homeExperiencesHeading', locale)}</h2>
        <div className="home-cards">
          <article className="home-card">
            {/*
             * Garden seating, which is what the card is about. There is
             * deliberately no treehouse photograph here: none of the
             * supplied frames is confirmed to show it, and captioning a
             * general garden picture as the treehouse would document a
             * space nobody has identified.
             */}
            <SitePhoto asset={venueMedia.gardenSeatingTrees} className="home-card-photo" />
            <h3>{chromeText('homeSeatingHeading', locale)}</h3>
            <LocalizedProse text={HOME_SEATING_TEXT} locale={locale} />
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
            {/*
             * The terrace under its string lights: a real evening at
             * Cladium, not a staged birthday setup. Showing décor here
             * would imply an arrangement is included, which the approved
             * policy explicitly does not say.
             */}
            <SitePhoto asset={venueMedia.terraceStringLightsNight} className="home-card-photo" />
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
        {/*
         * The caption said photographs show a category rather than a
         * specific dish — while there were no photographs on the section at
         * all. Either half alone is wrong: a caption describing nothing, or
         * food pictures with no statement of what they represent. Both are
         * here now, and the caption sits directly under the images it
         * describes.
         *
         * These are `category` provenance (media-manifest.ts): real plates
         * photographed at Cladium, with nobody having confirmed which menu
         * row any of them is. So they are never captioned with a dish name.
         */}
        <ul className="home-dining-thumbs" aria-label={chromeText('homeDiningHeading', locale)}>
          {[
            diningMedia.platedDishGreens,
            diningMedia.platterFriesVegetables,
            diningMedia.boardFriesOutdoor,
            diningMedia.teaCupGarden,
          ].map((asset) => (
            <li key={asset.path}>
              <SitePhoto asset={asset} className="home-dining-thumb" />
            </li>
          ))}
        </ul>
        <p className="u-muted home-dining-caption">{chromeText('homeDiningCaption', locale)}</p>
        <div className="home-card-actions">
          <Link href={`/${locale}/menu`} className="u-button u-button--primary">
            {chromeText('homeExploreMenuCtaLabel', locale)}
          </Link>
        </div>
      </section>

      <section className="u-section home-gallery">
        <h2>{chromeText('homeGalleryHeading', locale)}</h2>
        <PhotoGrid assets={galleryMedia} label={chromeText('homeGalleryHeading', locale)} />
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
