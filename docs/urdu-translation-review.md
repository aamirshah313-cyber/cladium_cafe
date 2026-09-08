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

## 2. Business and editorial copy still shown in English on Urdu pages

Each of these renders as approved English inside the Urdu page, correctly
marked up, until an owner-reviewed Urdu version exists. That is the
deliberate fallback, not a bug to be closed by translating them here.

| Source                          | Constant               | What it is                                                                 |
| ------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `modules/business/site-copy.ts` | `HOME_PLACE_TEXT`      | Editorial: the garden setting.                                             |
| `modules/business/site-copy.ts` | `HOME_SEATING_TEXT`    | Editorial + the treehouse position. **Reworded in this pass** — see below. |
| `modules/business/site-copy.ts` | `HOME_DINING_TEXT`     | Editorial: the kitchen. **Reworded in this pass** — see below.             |
| `modules/business/site-copy.ts` | `HOME_CLOSING_TEXT`    | Editorial: what a request is.                                              |
| `modules/business/facts.ts`     | `SEATING_POLICY_TEXT`  | Approved operational position.                                             |
| `modules/business/facts.ts`     | `BIRTHDAY_POLICY_TEXT` | Approved décor pricing and confirmation rule.                              |
| `modules/business/facts.ts`     | `DIRECTIONS_TEXT`      | Approved directions.                                                       |
| `modules/menu` (published rows) | —                      | All 118 item names and variant labels.                                     |

Two of those were reworded for accuracy in this pass, so if an Urdu
translation is prepared, translate the **new** English:

- `HOME_SEATING_TEXT` — "with room for most groups without booking ahead"
  became "and general seating is ample". The old phrasing read as a promise
  that a guest could simply turn up and be seated; what is actually approved
  is that general seating is ample, which is a statement about the garden's
  size and not about availability on any particular evening.
- `HOME_DINING_TEXT` — "The kitchen runs from midday until midnight" became
  "Cladium is open from midday until midnight … ask our staff about late
  orders". Midday–midnight is the venue's opening time; nobody has confirmed
  when the kitchen stops taking orders, and the old sentence quietly turned
  one into the other.

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
