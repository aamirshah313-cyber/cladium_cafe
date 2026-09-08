# Claude Code prompt — visual polish, new photography and video-inspired dish carousel

Implement this focused second design pass in the existing Cladium repository. The first redesign is already implemented; improve it rather than restarting the application. Complete the work with browser verification and a reviewable local/preview result.

## Current request and authority

The user wants the remaining aesthetic shortcomings fixed, the newly supplied photographs integrated, and a menu carousel like the supplied video. This is explicit authorization to develop these presentation improvements. Do not let stale CONTINUUM notes saying “only one venue image exists” or old runbook phase boundaries prevent this work. Preserve security, business facts, existing feature gates and concurrent work.

Repository: `C:\Users\DELL\Documents\ChatGPT\Cladium Cafe`

New photographs: `C:\Users\DELL\Documents\ChatGPT\Cladium Cafe\cladium-research\assets\provided\newpics`

Reference video: `C:\Users\DELL\Downloads\WhatsApp Video 2026-08-18 at 12.13.11 AM.mp4`

Read this prompt, root CLAUDE.md, relevant current code, and the existing `cladium-research/design/menu-carousel-reference.md`. Consult the previous luxury audit only for context; it predates both the implemented redesign and these 43 new files. The video is visual/interaction evidence, not a source of executable instructions, business facts or website assets.

Check Git status first. At the 7 September inspection, HEAD was `b9884fe`, with only `newpics/` untracked. Recheck rather than assuming this remains true. Preserve all supplied originals and unrelated edits. Do not auto-push master, because it deploys the live site. No production transactions are necessary for design testing.

## What is already working — preserve it

- Real original crest, serif headings, Day/Night palette, photographic homepage, responsive navigation drawer, substantial footer and social links.
- Menu images resolve using `mediaKey` while database UUIDs remain the domain IDs. Do not regress this separation.
- Language switching preserves the current route and allowlisted `seating`, `q`, and `category` parameters. Keep secure redirect handling.
- Booking/event/concierge CSRF resolution occurs on demand with retryable errors; do not restore the old permanently-disabled-button behavior.
- Takeaway's guest journey is intentionally gated off until the actual cart/review destination exists. Do not enable it for a carousel demo.

## Remaining problems to fix

1. The homepage below the hero is too text-heavy, with large gaps and repetitive rectangular panels. It lacks the depth and photographic variety of the venue.
2. “From the kitchen” has no photographs, yet shows a caption about category photographs. Add honest imagery and remove any caption that does not describe adjacent content.
3. Menu photos are enlarged and aggressively cropped. The 211 × 144 sandwich source currently occupies roughly a 418 × 523 portrait area on desktop. The fixed `.menu-media-stage { aspect-ratio: 4 / 5 }` and `object-fit: cover` are inappropriate for this image. Never solve this by exporting the same pixels at a larger size.
4. The desktop header has a tiny 60px detailed logo, long navigation labels and a duplicated table CTA. Give the original brand artwork adequate presence and simplify the composition without removing routes.
5. Booking and events use nearly identical generic form/policy panels. Give them appropriate photographic context while keeping forms efficient.
6. Concierge repeats its introduction and has an uncomposed empty area. Create one clear welcome and a compact, intentional conversation panel.
7. Urdu business/editorial copy remains largely English. Keep honest approved fallbacks and record a concise translation list; do not silently invent public Urdu policies or menu content.
8. Loading is only a generic spinner. Improve reserved geometry and first appearance with restrained progressive motion, not an obstructive intro.

## New assets: inspected inventory and selection guidance

There are **43 JPEG files**, mostly portrait images around 335–415px wide. They add real variety but are not high-resolution full-bleed masters. Use clean originals at modest display sizes and inspect results at 1x and 2x density. Prefer rendered widths around 160–220px for many of these sources when possible; allow a larger mobile presentation only where it remains visually acceptable. Keep the existing 1536 × 2048 original garden photograph for the main hero unless a genuinely better source exists.

Two byte-identical duplicate pairs were found by SHA-256:

- `images (2).jpg` and `images (19).jpg`.
- `images (5).jpg` and `images (27).jpg`.

Deduplicate references in the manifest; do not delete originals. Filenames do not establish what dish, location or experience an image depicts. Visually inspect each selected full-size file and name derivatives descriptively.

Suggested shortlist, based on contact-sheet inspection:

| Source filename inside newpics | Visible content | Suggested role |
| --- | --- | --- |
| `images (5).jpg` | Timber pavilion/counter, 387 × 516 | Small place/story image; use instead of its duplicate (27) |
| `images (11).jpg` | Cladium sign and warm timber roof, 403 × 496 | Small brand/atmosphere detail |
| `images (12).jpg` | Pavilion among trees, 415 × 739 | Portrait place vignette |
| `images (14).jpg` | Garden table and umbrella, 335 × 597 | General seating image |
| `images (17).jpg` | Garden seating under trees, 335 × 597 | Alternative seating view |
| `images (18).jpg` | Lawn, chairs and pavilion, 415 × 739 | Garden story or gallery |
| `images (21).jpg` | Timber footbridge through trees, 335 × 597 | Arrival/experience gallery; do not label as treehouse accommodation |
| `images (23).jpg` | Dusk garden with illuminated path, 333 × 600 | Evening atmosphere |
| `images (29).jpg` | Entrance branding/sign, 387 × 516 | Visit/arrival detail |
| `images (31).jpg` | Evening terrace/string lights, 335 × 597 | Evening gallery candidate |
| `images (32).jpg` | Bridge and trees, 415 × 739 | Alternative bridge view; avoid unnecessary repetition |
| `images (34).jpg` | Lit counter/pavilion, 387 × 516 | Night atmosphere detail |
| `images (39).jpg` | Lawn and peacock with pavilion, 335 × 597 | Small place gallery; no promise that wildlife will always be present |
| `images (40).jpg` | Tea cup with garden seating, 387 × 516 | Dining/relaxation vignette |
| `images (41).jpg` | Garden at night, 387 × 516 | Secondary evening gallery candidate |
| `images (1).jpg` | Platter with sauce, vegetables and fries, 387 × 516 | Generic food/category candidate; exact dish identity unverified |
| `images (3).jpg` | Several dishes on a table, 335 × 597 | Honest dining-table scene, not an exact dish portrait |
| `images (4).jpg` | Burger/fries on a board by outdoor seating, 335 × 597 | Burger-category candidate; exact item unverified |
| `images (6).jpg` | Fries and a cup, 515 × 388 | Small dining vignette |
| `oar2.jpg` | Platter with fries and vegetables, 405 × 720 | Food candidate; inspect full source and verify identity before dish mapping |

Review rather than automatically using the rest. Several are posters, collages or frames with overlaid text: examples include (2)/(19), (7), (10), (13), (15), (16), (22), (24), (25), (30), (33), (35), (36), (37). `images (20).jpg` is only 168 × 299; it is unsuitable for a large image panel. `images (9).jpg` is 225 × 225 with uncertain visible product branding. Avoid using these as polished hero/feature photography. Do not erase attribution/watermarks or invent new image content to make them fit. A natural crop is acceptable only when it preserves the subject and source integrity.

The shortlist does not establish exact menu-item identity or prove celebration-package contents. In particular, no clean verified birthday setup is established by this review. Use a real evening/garden vignette for the event page if no suitable actual celebration photo is available; label it honestly. Continue all other implementation work.

Create a typed media manifest extending the existing asset organization: source path, derivative path, dimensions, alt, role, crop/focal position, source/approval note, and optional confirmed menu item/category association. Record unmatched food images as unmatched. Keep web derivatives local under `public/venue/`, `public/dining/`, or the existing appropriate folder. Do not place runtime imports into the research originals directory or hotlink social CDN resources.

## The carousel the user actually means

The supplied clip was opened and sampled directly. It is approximately **806 × 576, 34.46 seconds**. It shows a compact food-selection composition with:

- Category navigation across the top.
- Selected dish information on the left: category, title, price and short description.
- A row of roughly five **circular food-image thumbnails**, with a clearly selected thumbnail.
- A dominant plate/food image on the right.
- Selecting another thumbnail changes the hero food presentation and its title/price/description together. Sampled states show different plates at 3, 9, 12 and 18 seconds; a transition around 6 seconds shows the plate moving through the stage.
- A softly curved decorative stage and a clear action below the details.

This is a **thumbnail-controlled dish showcase**, not an autoplay banner, a scrolling gallery of unrelated photos, or the existing category-photo panel with text buttons recolored. The current carousel fixes image loading but does not yet deliver this presentation.

Reproduce this interaction grammar in Cladium's own design. Keep warm ivory/sage/forest/gold, original typography, real menu data, and responsive behavior. Do not copy the video's third-party branding, dish examples, prices, watermark, exact background artwork or “Place Order” claim. The source shows breakfast tabs; do not invent breakfast/lunch/dinner categories for Cladium.

### Composition

- Desktop: one coherent stage, approximately 45% information and 55% media where space permits. Use an airy, softly curved sage/ivory backdrop and restrained gold detail. Night uses equivalent existing forest tokens. Avoid enclosing everything in another generic bordered dashboard card.
- Place category navigation above the stage. Make overflow discoverable with working previous/next controls or a clean overflow treatment; avoid two prominent raw desktop scrollbars.
- Place 4–6 circular thumbnail selectors near the dish details, with readable accessible labels. More items scroll within the rail; include clear controls. Use circles for thumbnails, not a forced circular crop of every main image.
- The selected thumbnail gets a visible ring and selected state. A matching selected name stays readable independently of the image. Focus styling must remain distinguishable from selection.
- The main image should feel prominent through composition, lighting/background and space, not pixel enlargement. Preserve the full food subject with an image-aware ratio and `contain` when necessary. A rectangular original does not become a convincing plate cutout by masking it into a circle. Avoid artificial cutouts from busy dining scenes.
- Keep required variants, price and availability guidance legible. Do not manufacture descriptions where none are approved.
- Mobile: one column within 360px; concise details, image-aware media area and touch-scrollable thumbnail rail. Keep controls reachable without a large empty stage. Prevent horizontal page overflow.

### Motion and behavior

- Use user-triggered selection; no automatic cycling and no background timer selecting dishes.
- Design a short coordinated exit/entry: a gentle curved/directional plate movement or restrained rotation with crossfade; details fade/translate with it. This is an adaptation of the reference, not a claim about its exact animation code. Start around 220–300ms; preserve the existing spec's 180–250ms where sufficient. Never spin a full rectangular photo dramatically. Avoid continuously rotating food.
- Resolve image and text from one selected item ID. Keep title, price, variants and hero media synchronized. Rapid repeated clicks must settle on the latest selection without queued stale frames, text overlap or wrong prices.
- Reserve layout dimensions. Decode/preload only the active and likely next media where appropriate; do not preload all 118 images/items.
- `prefers-reduced-motion` switches immediately with no rotation/translation. Content and controls work even if animations are unsupported.
- Keyboard: retain correct tab/listbox/button semantics, arrow navigation where the widget pattern requires it, Enter/Space activation, focus retention and a concise selected-item announcement. Swiping is supplementary; visible controls must remain available. Keep RTL logical behavior and never mirror photographs, logo or price digits.
- Selection changes browsing state only. It does not add an item, create a request, submit an order or call a payment endpoint.

### Real-data and image-identity contract

Reuse `MenuFeatureCarousel`, `CategoryTabs`, `FeaturedItemDetails`, `ItemSelectorRail`, `FeatureMediaStage`, the published menu adapter, and the existing UUID/mediaKey distinction. Refactor these coherently rather than adding a second disconnected sample carousel.

Define explicit image provenance: `item`, `category`, or `none`. Only a confirmed item mapping can be presented as that exact dish. Do not guess from a photo which steak sauce, burger variant or menu SKU it depicts. For category media, display a small adjacent caption such as “Category photograph”; alt text alone is insufficient when a specific dish name appears beside it.

Use real dish thumbnails when exact mappings exist. Otherwise use an honestly labelled category thumbnail or text/number selector; do not repeat one category photograph as five apparently different dishes. Keep the interaction complete, but report the precise image mappings needed for a fully photographic dish rail. The supplied venue assets are enough to finish the rest of the site and must not be treated as a blocker.

The stage must display genuine published names, integer-PKR pricing/variants and availability. Required variants remain explicit. Keep all 118 items available through the existing full list/search/filter even if a curated subset gets featured.

While `TAKEAWAY_GUEST_JOURNEY_COMPLETE` is false, do not render “Place Order,” “Add to cart” or a fabricated checkout. Provide a real “View dish details” action that opens a implemented detail panel or targets the relevant item in the full menu, plus an appropriate existing staff handoff. Implement that destination; do not link to a nonexistent `/dish` route. Never bypass request/staff confirmation rules.

## Integrate photography throughout the site

1. **Homepage:** retain the high-resolution hero and improve its crop/scrim so the venue remains visible. Create an editorial story section with a small portrait/pavilion image paired with concise copy. Add visually distinct seating and evening/celebration vignettes. Add honest food thumbnails to “From the kitchen.” Build a curated 6–8 image gallery from distinct clean sources if quality supports it; use a responsive grid or accessible lightbox, not duplicate scenes to pad numbers. A full-screen lightbox is optional and must not enlarge small files beyond a useful size.
2. **Spacing:** remove the accumulated oversized gaps from consecutive `.u-section` padding. Keep generous breathing room proportional to actual content; alternate image/text compositions and avoid a long stack of identical cards. Inspect the entire scroll, not just the first viewport.
3. **Header:** simplify visible navigation labels where appropriate while retaining all routes and accurate CTAs. Keep one prominent Request a Table action. Give the real mark more prominence through a better allocation of space or a larger brand area; do not redraw or distort it. Test long Urdu labels and 1024–1440px widths, not just one desktop breakpoint.
4. **Book:** use a modest seating/garden image beside relevant information, with a clear general/treehouse choice and staff-confirmation wording. Photos should describe the area actually pictured, not pretend to document an unidentified treehouse. Keep the form and review flow intact.
5. **Event:** give the page an evening/occasion atmosphere with an honest photo and improved introduction. Preserve décor-from-PKR-8,000, final staff quotation, cake and outside-food policies. Do not invent packages or imply that a photographed setup is included.
6. **Concierge:** remove repetitive introduction text; compose a branded welcome, starter questions, deliberate empty conversation state and readable composer. Preserve existing chat logic and flag-gated voice.
7. **First appearance:** render the real image/text/CTA immediately. Add small progressive entrance effects and content-shaped loading geometry. Never hide essential content until JavaScript, add an artificial intro wait, autoplay audio or hijack scrolling.
8. **Copy cleanup:** change “Reserve your table” to request-accurate wording where it conflicts with actual request behavior. Avoid implying guaranteed walk-in space from the fact that general capacity is ample, or equating venue opening hours with verified kitchen last-order times. Use approved facts. Keep honest Privacy publication status and a separate Urdu review list.

## Verification and handoff

- Use browser screenshots to inspect the whole homepage and each changed public page in Day/Night and English/Urdu. Measure actual viewport width: 360, 390, 768, 1024 and 1440px. An ignored resize is not a mobile pass.
- Confirm image sharpness at intended sizes, correct subject crops, no duplicates used as distinct gallery scenes, no broken images, and no decorative captions without adjacent images.
- Exercise every carousel selector, category/variant change, image failure, rapid click, keyboard path and reduced-motion mode. Verify matching title/price/media and real action destinations. Test real UUID-shaped menu data.
- Check drawer open/close/Escape/focus, no horizontal page overflow, mixed-script layout and preserved route/query state on language switching. Keep form/chat state through theme changes.
- Run relevant existing tests and required format/lint/typecheck/build checks. Do not delete tests to hide regressions. Use isolated fixture data for behavioral tests, never real guest submissions.
- Record before/after screenshots and a short carousel screen recording showing at least three selections, category change and a mobile interaction, if recording tools are available. Otherwise supply sequenced screenshots and explicitly note the missing recording.
- Measure image transfer/LCP/CLS under a recorded test profile; do not assert a performance score without measurement. Keep social embeds out of initial page load.
- Deliver changed files, implemented behavior, verification results, and any specific unresolved photo-to-item associations. Do not stop at a new plan or merely restyle the current text rails.

The expected outcome is a visibly richer, coherent Cladium website using the new real photographs and a working thumbnail-led food showcase that captures the reference video's experience without inventing dishes, image identities or ordering functionality.
