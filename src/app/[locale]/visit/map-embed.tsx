'use client';

/**
 * Click-to-load map for the Visit page.
 *
 * **Nothing is requested from Google until the guest asks for it.** On
 * arrival this renders a local placeholder — the address, and a button. The
 * `<iframe>` is only created after a click.
 *
 * That is not caution for its own sake. An always-on Google Maps embed
 * contacts Google on every page view and hands over the visitor's IP and a
 * referrer before they have done anything, which is precisely the kind of
 * third-party load this project gates behind consent everywhere else (the
 * Meta pixel does not render without a recorded grant). The design brief
 * says the same thing in layout terms: a map "should be an enhancement, not
 * a load-blocking embed" and "must not add unnecessary tracking". A guest
 * who never touches it is never exposed to it.
 *
 * It is also why the CSP can stay tight: `frame-src` permits exactly
 * `https://www.google.com` and nothing else (`lib/security/headers.ts`).
 *
 * The placeholder reserves the same box the map will occupy, so revealing
 * it does not shift the page. `GOOGLE_MAPS_URL` remains available as a
 * plain link for directions, which keeps the page fully useful with
 * JavaScript disabled and for anyone who would rather not load the embed at
 * all.
 */

import { useState } from 'react';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import { MAP_LATITUDE, MAP_LONGITUDE } from '../../../modules/business/facts';

interface MapEmbedProps {
  readonly locale: Locale;
}

/**
 * Google's keyless embed form. Coordinates come from the approved business
 * profile, so the pin is the confirmed venue rather than a name search that
 * could resolve somewhere else.
 */
const EMBED_SRC = `https://www.google.com/maps?q=${MAP_LATITUDE},${MAP_LONGITUDE}&z=16&output=embed`;

export function MapEmbed({ locale }: MapEmbedProps) {
  const [shown, setShown] = useState(false);

  if (!shown) {
    return (
      <div className="map-placeholder">
        <button
          type="button"
          className="u-button u-button--secondary"
          onClick={() => setShown(true)}
        >
          {chromeText('mapShowButtonLabel', locale)}
        </button>
        {/* Said before the click, not after, so the guest is choosing with
            the relevant fact in front of them. */}
        <p className="field-hint">{chromeText('mapThirdPartyNoticeText', locale)}</p>
      </div>
    );
  }

  return (
    <iframe
      className="map-frame"
      src={EMBED_SRC}
      title={chromeText('mapFrameTitle', locale)}
      loading="lazy"
      // No referrer to Google beyond the bare origin, and the frame cannot
      // reach back into this document.
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  );
}
