# Urdu translation review list

A record of what an Urdu-reading owner or staff member needs to check or
supply. It is a list of what is outstanding — **nothing here is a licence to
publish an invented translation.**

CLAUDE.md draws the line this document follows:

> Never machine-invent or silently publish Urdu translations for
> authoritative menu names, descriptions, policies, promotions, or legal
> content.

So the two categories are handled differently, and the difference is not
cosmetic:

- **Interface chrome** (`src/lib/i18n/chrome.ts`) — navigation labels,
  button text, form field labels, section headings. `design/localization-and-rtl.md`
  calls these "reviewed application translations", and they ship with Urdu.
  They still want a read-through, which is what section 1 is for.
- **Business, menu, policy and editorial content**
  (`src/modules/business/facts.ts`, `site-copy.ts`, and the menu itself) —
  these do **not** ship with a machine translation. `canonicalLocalizedText`
  renders the approved English with correct `lang="en"` / `dir="ltr"` markup
  inside an Urdu page, so an Urdu reader sees the real approved wording
  rather than a plausible-looking guess at it. Section 2 lists what is
  waiting for a real translation.

## 1. Interface chrome added or changed in the visual-polish pass

These are live in the Urdu interface now and want a native read-through.
The English is the source of truth if the two ever disagree.

| Key                             | English                                                                      | Urdu as shipped                                                                          | Note                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `carouselCategoryPhotoCaption`  | Photograph of this category, not of the selected dish                        | اس زمرے کی تصویر، منتخب کردہ ڈش کی نہیں                                                  | Honesty caption under the menu carousel's photograph. The _meaning_ here is load-bearing — it is what stops a category photo reading as a specific dish — so if the Urdu is weak, fix the Urdu rather than dropping the caption.            |
| `carouselViewDishDetailsLabel`  | View dish details                                                            | ڈش کی تفصیلات دیکھیں                                                                     | Links to the item's row in the full menu list.                                                                                                                                                                                              |
| `carouselPreviousCategoryLabel` | Previous categories                                                          | پچھلے زمرے                                                                               | Not currently rendered to assistive technology — the edge controls are `aria-hidden` because the tablist's own arrow keys already reach the same content. Kept for when a visible label is wanted.                                          |
| `carouselNextCategoryLabel`     | More categories                                                              | مزید زمرے                                                                                | As above.                                                                                                                                                                                                                                   |
| `homeGalleryHeading`            | Around the garden                                                            | باغ کے اطراف                                                                             | Heading for the six-photograph homepage gallery.                                                                                                                                                                                            |
| `homeClosingHeading`            | Request your table                                                           | اپنی میز کی درخواست کریں                                                                 | **Changed.** Was "Reserve your table" / "اپنی میز محفوظ کریں", which said the site reserves a table. It does not — a guest sends a request and staff confirm it. Please check the Urdu carries _request_, not _reserve_.                    |
| `homeDiningCaption`             | Photographs of food served at Cladium. They do not show specific menu items. | کلیڈیم میں پیش کیے جانے والے کھانے کی تصاویر۔ یہ کسی مخصوص مینو آئٹم کو ظاہر نہیں کرتیں۔ | **Changed.** Was "Photographs show each category, not a specific dish" — which described a per-category set the section never had. It now sits above four real Cladium food photographs, none matched to a menu row, and says exactly that. |

## 1b. Added or changed in the carousel/3D pass

| Key                     | English          | Urdu as shipped | Note                                                                                                                                                                                               |
| ----------------------- | ---------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `languageSwitcherLabel` | Languages        | زبان            | **Changed** from "Language". Now labels a select, not a pair of links.                                                                                                                             |
| `themeSwitcherLabel`    | Themes           | تھیم            | **Changed** from "Theme". Now labels a select.                                                                                                                                                     |
| `dayThemeName`          | Light            | روشن            | **Changed** from "Day" / "دن". Please confirm روشن reads naturally as a UI theme name rather than as "bright".                                                                                     |
| `nightThemeName`        | Dark             | تاریک           | **Changed** from "Night" / "رات". Same question for تاریک.                                                                                                                                         |
| `carouselPreviousLabel` | Previous choices | پچھلے انتخاب    | Accessible name for the scroll-back control on both the category strip and the item rail. These controls are now exposed to assistive technology rather than hidden, so this string is read aloud. |
| `carouselNextLabel`     | More choices     | مزید انتخاب     | As above.                                                                                                                                                                                          |

### Two layout fixes that are not translations

- Menu item names are now explicitly `lang="en" dir="ltr"` in the carousel
  heading as well as in the selector rail. They are canonical English, and
  on an Urdu page the inherited Nastaliq stack was being asked to set Latin
  text — it fell back, but only after applying the tight Nastaliq line box,
  and a two-line dish name then overflowed into the price beneath it.
- Urdu chrome inside the carousel (availability, caption, category label)
  now gets `line-height: 2.1`. Nastaliq ascenders and descenders are far
  deeper than Latin, and the caption was rendering 24px of glyph in a 17px
  line box.

## 2. Business and editorial copy — owner-approved Urdu, now published

These were English-on-Urdu-pages until the owner reviewed and approved the
Urdu on 9 September 2026. They are now `ownerApprovedLocalizedText` and
render in Urdu on `/ur`. The English is unchanged and still renders on `/en`.

| Source                          | Constant                   | What it is                              |
| ------------------------------- | -------------------------- | --------------------------------------- |
| `modules/business/site-copy.ts` | `HOME_PLACE_TEXT`          | Editorial: the garden setting.          |
| `modules/business/site-copy.ts` | `HOME_SEATING_TEXT`        | Editorial + the treehouse position.     |
| `modules/business/site-copy.ts` | `HOME_DINING_TEXT`         | Editorial: opening hours and the range. |
| `modules/business/site-copy.ts` | `HOME_CLOSING_TEXT`        | Editorial: what a request is.           |
| `modules/business/facts.ts`     | `SEATING_POLICY_TEXT`      | Approved operational position.          |
| `modules/business/facts.ts`     | `BIRTHDAY_POLICY_TEXT`     | Décor pricing and confirmation rule.    |
| `modules/business/facts.ts`     | `DELIVERY_POLICY_TEXT`     | No home delivery; takeaway only.        |
| `modules/business/facts.ts`     | `CAKE_POLICY_TEXT`         | No cakes provided.                      |
| `modules/business/facts.ts`     | `OUTSIDE_FOOD_POLICY_TEXT` | Outside food not allowed.               |
| `modules/business/facts.ts`     | `DIRECTIONS_TEXT`          | Approved directions.                    |

What the Urdu deliberately preserves — and what `business-facts.test.ts` now
enforces rather than trusting:

- **`PKR 8,000` and `1.4` appear as digits, untranslated.** Numerals are
  "preserve original configured values" under `localization-and-rtl.md`, so a
  test fails if the décor floor price is restated, or if any other PKR figure
  appears in the Urdu.
- **The delivery refusal survives translation.** A test asserts the Urdu
  still carries a negation, because a softened delivery policy is the one
  mistranslation here that would actually mislead a guest.
- **Seating is _requested_, not reserved** (درخواست پر, never محفوظ), and the
  hours are the venue's opening times rather than a claim about when the
  kitchen stops taking orders.

An approved translation is also checked for being real Urdu rather than the
English copied across — the shape a careless translation pass leaves behind.

### Still English on Urdu pages

| Source                          | What it is                             |
| ------------------------------- | -------------------------------------- |
| `modules/menu` (published rows) | All 118 item names and variant labels. |

Menu item names are canonical English and stay that way for now. They are the
largest remaining gap and need their own owner-approved translation pass.
Until then they are marked `lang="en" dir="ltr"` wherever they appear inside
an Urdu page, so they are pronounced and laid out correctly.

## 3. Layout checks that need an Urdu reader, not a translator

- Header navigation at 1024–1440px: Urdu labels are longer, and the header
  previously grew to three lines before `white-space: nowrap` and a raised
  breakpoint fixed it. The `/book` link has since been removed from the nav
  (the prominent "Request a Table" button was already beside it), so the row
  is shorter than when that was last measured.
- The menu carousel's category strip and item rail scroll horizontally. In
  Urdu they scroll the other way, the edge controls swap sides with the flex
  direction, and their chevrons are mirrored to match. Photographs, the
  crest and price digits are never mirrored.
- `LocalizedProse` marks English fallbacks `lang="en" dir="ltr"` inside the
  Urdu page. Confirm mixed-script paragraphs read correctly rather than
  merely rendering.
