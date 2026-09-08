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
 * The owner reviewed and approved the Urdu for all four paragraphs below,
 * so they are `ownerApprovedLocalizedText` and Urdu renders on Urdu pages.
 * Anything added here later starts as `canonicalLocalizedText` — English in
 * both locales, with correct `lang`/`dir` markup via `LocalizedProse` —
 * until it has been through the same review.
 *
 * The Urdu carries the same constraints as the English, and the wording was
 * checked for the two that matter most: seating is described as *requested*
 * rather than reserved, and the hours are the venue's opening times rather
 * than a claim about the kitchen's last orders.
 */

import { ownerApprovedLocalizedText, type LocalizedText } from '../../lib/i18n/localized-text';

/** Introduces the setting shown in the hero photograph. */
export const HOME_PLACE_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'Cladium sits among mature trees in Tarhana, a short drive from Abbottabad. Paths cross the lawn between the tables, and in the evening the lights come on in the branches above the timber counter.',
  'کلیڈیم تڑھانہ میں پرانے درختوں کے درمیان واقع ہے، ایبٹ آباد سے تھوڑے فاصلے پر۔ میزوں کے درمیان لان میں راستے گزرتے ہیں، اور شام کو لکڑی کے کاؤنٹر کے اوپر شاخوں میں روشنیاں جل اٹھتی ہیں۔',
);

/**
 * Sets expectations for the two seating choices without promising either.
 *
 * "with room for most groups without booking ahead" was doing more work
 * than the approved fact supports. What is confirmed is that general
 * seating is *ample* — a statement about the size of the garden, not a
 * guarantee that space will be free at any particular hour on any
 * particular evening. A guest who read it as "you can just turn up" and
 * arrived to a full garden would have been misled by this site, so the
 * sentence now describes the garden and leaves availability where it
 * actually sits: with staff.
 */
export const HOME_SEATING_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'Tables are spread across the garden, and general seating is ample. The treehouse seats far fewer people, so it is requested rather than reserved: our staff confirm it directly with you.',
  'میزیں پورے باغ میں پھیلی ہوئی ہیں، اور عام نشستوں کی گنجائش وافر ہے۔ ٹری ہاؤس میں نشستیں بہت کم ہیں، اس لیے یہ محفوظ کرنے کے بجائے درخواست پر دی جاتی ہے: ہمارا عملہ آپ سے براہِ راست تصدیق کرتا ہے۔',
);

/**
 * Frames the dining section honestly against category-level photography.
 *
 * "The kitchen runs from midday until midnight" turned an approved
 * *opening* time into a claim about the kitchen's own last orders. Nobody
 * has confirmed when the kitchen stops taking them, and a guest arriving at
 * 11:45pm on the strength of this sentence would have been let down by it.
 * The hours are stated as what they are — when Cladium is open — and the
 * question of a late order is sent to the people who can answer it.
 */
export const HOME_DINING_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'Cladium is open from midday until midnight, across grills, karahi, pasta, wok dishes, sandwiches and cold drinks. Browse the full menu for every item, variant and current price, and ask our staff about late orders.',
  'کلیڈیم دوپہر بارہ بجے سے رات بارہ بجے تک کھلا رہتا ہے — گرل، کڑاہی، پاستا، ووک ڈشز، سینڈوچ اور ٹھنڈے مشروبات۔ ہر آئٹم، قسم اور موجودہ قیمت کے لیے مکمل مینو دیکھیں، اور دیر سے آرڈر کے بارے میں ہمارے عملے سے پوچھیں۔',
);

/** Closes the page by naming what a request actually is. */
export const HOME_CLOSING_TEXT: LocalizedText = ownerApprovedLocalizedText(
  'Send us a table request with your date, time and group size, and our staff will come back to confirm it. Prefer to ask something first? Message us on WhatsApp.',
  'اپنی تاریخ، وقت اور افراد کی تعداد کے ساتھ میز کی درخواست بھیجیں، ہمارا عملہ تصدیق کے لیے آپ سے رابطہ کرے گا۔ پہلے کچھ پوچھنا چاہتے ہیں؟ ہمیں واٹس ایپ پر پیغام بھیجیں۔',
);
