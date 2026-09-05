/**
 * Editorial copy written for the public site's redesign.
 *
 * Separate from `facts.ts` on purpose: that file holds operational facts a
 * Cladium representative confirmed, and this file holds presentation prose
 * written to introduce the venue. Keeping them apart means nothing here can
 * ever be mistaken for an approved operational answer the concierge may
 * quote.
 *
 * Every sentence below is constrained to two sources and nothing else:
 *
 * 1. What the supplied garden photograph actually shows — mature trees, a
 *    lawn path, a lit timber counter, warm lights strung through the
 *    branches. Verified by opening the image, not inferred from a filename.
 * 2. Facts already confirmed in `facts.ts` (the Tarhana/Abbottabad setting,
 *    opening hours, ample general seating, limited staff-confirmed
 *    treehouse seating).
 *
 * Deliberately absent, because none of it is approved and a redesign is not
 * a licence to invent: any claim about the food's quality or origin, any
 * award, rating, review or "renowned/famous/best" phrasing, any invented
 * facility (pool, rooms, spa, parking, wifi), any weather or view promise,
 * and any suggestion that a request is a confirmed booking.
 *
 * `canonicalLocalizedText` means Urdu falls back to this English text with
 * correct `lang`/`dir` markup (`LocalizedProse`) until an owner approves a
 * real translation — never a machine-translated one.
 */

import { canonicalLocalizedText, type LocalizedText } from '../../lib/i18n/localized-text';

/** Introduces the setting shown in the hero photograph. */
export const HOME_PLACE_TEXT: LocalizedText = canonicalLocalizedText(
  'Cladium sits among mature trees in Tarhana, a short drive from Abbottabad. Paths cross the lawn between the tables, and in the evening the lights come on in the branches above the timber counter.',
);

/** Sets expectations for the two seating choices without promising either. */
export const HOME_SEATING_TEXT: LocalizedText = canonicalLocalizedText(
  'Tables are spread across the garden, with room for most groups without booking ahead. The treehouse seats far fewer people, so it is requested rather than reserved: our staff confirm it directly with you.',
);

/** Frames the dining section honestly against category-level photography. */
export const HOME_DINING_TEXT: LocalizedText = canonicalLocalizedText(
  'The kitchen runs from midday until midnight, across grills, karahi, pasta, wok dishes, sandwiches and cold drinks. Browse the full menu for every item, variant and current price.',
);

/** Closes the page by naming what a request actually is. */
export const HOME_CLOSING_TEXT: LocalizedText = canonicalLocalizedText(
  'Send us a table request with your date, time and group size, and our staff will come back to confirm it. Prefer to ask something first? Message us on WhatsApp.',
);
