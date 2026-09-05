# Cladium visual redesign: live audit and implementation brief

Prepared 5 September 2026 from the live Vercel website, rendered browser inspection, official social profiles, and repository source/assets. This is a design workstream brief, not a production-readiness approval.

## Outcome

Build a distinctive, polished mountain-garden dining website around Cladium's real identity: the original forest-and-gold crest, warm garden lights, timber structures, trees, generous spacing, and elegant typography. The present website exposes much of the application's functionality but barely presents the venue. A coherent visual system and proper resource integration will make a larger difference than adding decorative effects.

The implementation prompt is [CLAUDE_LUXURY_REDESIGN_PROMPT.md](../claude/CLAUDE_LUXURY_REDESIGN_PROMPT.md).

## Audit scope and limits

- Opened the seven public page destinations in both languages: Home, Menu, Book, Event, Visit, Concierge, Privacy. Also opened the treehouse query variant in both languages.
- Inspected navigation/footer/main-content links, live DOM, screenshots, Day and Night controls, rendered menu category identifiers, local source, and image dimensions.
- Followed the English menu's Urdu language link and verified that it lands on the Urdu homepage. Opened Google Maps and the English WhatsApp handoff. Reviewed the official Facebook cover/profile and Instagram grid plus the garden reel linked below.
- This is navigation and presentation verification, not a transaction audit: no real booking, enquiry, order, chat message, or WhatsApp message was submitted. No authenticated staff workspace was inspected.
- No HTTP status-code certification: terminal HTTP requests were unavailable in this environment; successful browser rendering is the evidence for page reachability.
- The attempted mobile viewport override did not take effect (the measured browser width remained 1280px). Screenshots support desktop findings only. Real mobile testing remains an explicit implementation acceptance requirement.
- Claude is working concurrently. The earlier repository snapshot was `9354626`; a later status check showed changes to `src/modules/events/deps.ts`. Recheck the current HEAD and working tree before implementation. Do not overwrite another session's changes.

## Public link audit

| Destination or control | Observed result | Redesign action |
| --- | --- | --- |
| `/en`, `/ur` and linked brand/Home | Home renders, with generic intro and a stack of text CTAs; no logo image or venue photo | Build the full arrival/story/menu/place narrative |
| `/en/menu`, `/ur/menu` | Published categories, prices, carousel and search/list render; initial featured category displays decorative SVG fallback, with zero image elements | Repair media identity mapping, then restyle both carousel and full menu |
| `/en/book`, `/ur/book` | Booking form renders | Create a polished request form and supporting seating information |
| `/en/book?seating=treehouse`, `/ur/book?seating=treehouse` | Request form renders; English treehouse selection visibly checked | Preserve query semantics and carry them through language navigation |
| `/en/event`, `/ur/event` | Event form and genuine décor/cake/outside-food policies render | Add a celebratory venue-led introduction and a calm form layout |
| `/en/visit`, `/ur/visit` | Address, directions, hours, WhatsApp, and operational notes render | Design an arrival page with image, directions card and clear contact hierarchy |
| `/en/concierge`, `/ur/concierge` | Intro and message input render; no convincing welcome composition | Build a branded chat welcome, suggestion controls and readable conversation states |
| `/en/privacy`, `/ur/privacy` | Page openly states that full privacy wording is unpublished; WhatsApp contact renders | Improve reading layout while retaining truthful publication status and existing consent functionality |
| Language preference links | Inner pages emit `path=/en` or `path=/ur`, not their actual path. Clicking Urdu from `/en/menu` lands at `/ur` | Correct pathname and supported query preservation; do not discard seating/search context |
| Skip to content | Link points to the main-content anchor, but is permanently visible beside the brand | Visually conceal until keyboard focus; keep it first in focus order; test actual focus transfer |
| Day / Night | Both controls respond and colors change | Keep behavior; redesign controls and verify refresh/state preservation |
| Google Maps from Visit | Resolves to the Cladium Cafe&Resort listing at the configured coordinates | Retain the verified destination; don't substitute a generic city map |
| WhatsApp from Home/Visit/Privacy | English URL opens the configured number with the expected generic message. Landing page displays profile name “Mehran” | Owner should verify business ownership/display name. Keep configured number until confirmed; no message was sent |
| Facebook / Instagram | Both official profiles open, with login prompts on some views | Add visible, labelled official social links to the footer; use local curated media, not a mandatory live social feed |

The existing public page links do not reveal a missing page. The main link defect is loss of context on language switching. The carousel has an add-to-takeaway action and subtotal but no visible cart/review destination in the audited menu. Treat this as an unfinished guest journey; do not invent a checkout link as a styling shortcut.

The Google Maps listing displays a different public phone number from the website's WhatsApp number. The source business profile already distinguishes call numbers from WhatsApp and calls for primary-number confirmation. This difference is not proof that either is wrong.

## Concrete implementation findings

### 1. The basic shell was never developed into a visual shell

`src/app/[locale]/site-header.tsx` renders semantic header content with no layout classes, a text brand link, a bulleted navigation list, language links, and basic theme buttons. `site-footer.tsx` renders brand text, hours/status, and Privacy. `page.tsx` is a text-only heading, paragraphs, and links. `globals.css` supplies colors and some carousel styling, but no complete public-site layout or typography system.

This is consistent with the live screenshots, rather than evidence that the entire stylesheet failed to load. Header/footer components should be evolved, not duplicated.

### 2. Missing menu photos are an identity-contract bug

`menu-feature-carousel.tsx` calls `resolveCategoryMedia(category.id)`. `media-mapping.ts` is keyed by stable slugs such as `sandwiches` and `steaks`. However, `guest-view-repository.ts` selects database `id, name, sort_order` and puts UUID `id` into `MenuViewCategory.id`.

The live DOM confirms UUID tab IDs, e.g. `menu-carousel-tab-eea04428-b1ae-4aa4-8c25-5646e9fccec0` for Sandwiches. There is no `<img>` in that initial rendered menu; the component selects its fallback because the lookup misses.

Repair the presentation contract: carry an explicit stable media key through the read model using the existing canonical mapping/schema, while preserving database UUIDs for domain operations. Inspect the schema before choosing the source of that key. Never replace database IDs with slugs globally or hardcode staging UUIDs. Test UUID-backed published categories, all 12 mapped categories, and unknown-category fallback. Re-verify in the actual rendered preview.

### 3. Language navigation is wired to the locale root

`SiteHeader` passes `currentPath={\`/${locale}\`}` to `LanguageSwitcher`. Its documented promise to redirect to the equivalent page is not fulfilled for inner pages. Derive the actual pathname and allowed query parameters in a small client component, keeping the existing secure preference endpoint. Test both directions from menu searches and treehouse booking.

### 4. Source comments and memory are stale in places

Comments still describe the homepage as waiting for assets, the menu as unpublished, the carousel as not wired, and the footer as restricted to an earlier runbook step. The actual menu is published and the original resources exist. These historical comments must not block this user-authorized visual workstream.

The CONTINUUM README says the external repository was inaccessible during initial setup and was never installed. The current mechanism is ordinary local Markdown plus context-routing instructions. There are no CONTINUUM hooks in the inspected `.claude/settings.json`; that file contains command/secret permissions.

The “compact” files have also grown considerably (approximately 120 KB state, 96 KB tasks, 282 KB decisions at the earlier inspection), defeating their original compact-resume intention. Use targeted excerpts; resolve contradictions against actual code, the live site, verified data, and this request. Do not remove secret protections or business safeguards to save tokens.

## Asset inventory and recommended use

| Existing resource | Verified properties | Use |
| --- | --- | --- |
| `cladium-research/assets/provided/Bigger LOGO.jpg` | 1254 × 1254; original detailed crest/wordmark on forest background; about 75 KB | Primary source for header identity, hero brand panel and larger footer brand block. Preserve the entire mark and aspect ratio |
| `cladium-research/assets/provided/LOGO.jpg` | Small compressed alternate, about 5 KB | Secondary fallback only; use the larger original by default |
| `cladium-research/assets/official-profile/instagram-profile.jpg` | Existing downloaded official profile artwork | Reference/alternate after visual comparison; not a substitute for the larger supplied artwork |
| `cladium-research/assets/provided/Pictures/713903386_122094484275358962_9090042462749697376_n.jpg` | 1536 × 2048; about 759 KB; authentic garden, trees, path, timber counter and warm lights. Same setting as Facebook cover | Homepage hero with carefully chosen desktop/mobile crop; secondary portrait story image if needed |
| `cladium-research/assets/provided/Menu/*.jpg` | Eight original menu sheets | Source evidence for approved menu data and existing photo crops; do not use full price-sheet posters as luxury backgrounds |
| `public/menu/*.jpg` | 12 representative category photos already exported and mapped | Smaller category accents; not evidence of a particular selected dish |

Food-crop dimensions are important:

| File | Pixels | File | Pixels |
| --- | --- | --- | --- |
| sandwiches.jpg | 211 × 144 | steaks.jpg | 221 × 372 |
| desi-cuisine.jpg | 196 × 371 | exclusive-beef-entree.jpg | 882 × 144 |
| italian.jpg | 181 × 208 | chinese.jpg | 181 × 216 |
| extra-side.jpg | 176 × 201 | starters.jpg | 196 × 259 |
| soup.jpg | 196 × 209 | burgers.jpg | 235 × 201 |
| bar-menu.jpg | 206 × 359 | bbq.jpg | 216 × 330 |

Most crops will look soft at 480px wide, especially on high-density screens. Use a smaller framed composition surrounded by intentional space, not a giant empty placeholder or a stretched image. The very wide beef crop cannot simply become a tall full-bleed photograph. Better food originals are an enhancement; they must not hold up the header, footer, typography or homepage.

Preserve originals. Add optimized derivatives under `public/brand/` and `public/venue/` during implementation, with a typed asset manifest containing source path/URL, width, height, alt text, focal points, intended use, and approval status. Serve local assets through `next/image` or an appropriate responsive picture element. A hero may visually act as a background while remaining a positioned responsive image.

## Social resource review

- [Official Facebook](https://www.facebook.com/people/CladiumCafeResort/61590768862564/): forest/gold profile identity and warm garden cover. The matching garden source is already in the repository, so downloading a second compressed cover is unnecessary.
- [Official Instagram](https://www.instagram.com/cladium.cafe/): garden paths, timber seating, celebrations, bridge views and food promotional imagery. The grid also contains collaborator/visitor posts, which must not automatically become website-owned assets.
- [Garden reel: Peace, Perfected](https://www.instagram.com/cladium.cafe/reel/DcDvWZRsXUp/): opened and visually inspected. About 20 seconds, portrait 1440 × 2560 as reported by the browser, warm illuminated pathways and timber seating. The visible clip has a prominent text overlay. Strong atmosphere reference; use a clean original if choosing future motion media.
- [Celebration/decor reference](https://www.instagram.com/cladium.cafe/reel/DclCXk2MEyr/): grid preview shows a decorated entry/bridge. Candidate for an event image, subject to review of the original and identifiable guests.
- [Evening celebration reference](https://www.instagram.com/cladium.cafe/reel/Dc1FNkqsKeV/): grid preview indicates table/balloon/night setting. Candidate for event imagery; full clip not audited.
- [Bridge/garden reference](https://www.instagram.com/cladium.cafe/reel/Dc0fKFdMyey/): grid preview indicates a bridge/park setting. Candidate for the visit or experience section; full clip not audited.

No additional media was downloaded in this audit: usable first-pass originals already exist locally; the inspected reel is streamed and captioned, and its observed asset inventory contains multiple video resources that were not established as clean full masters. Do not confuse a preview thumbnail or stream fragment with a production-ready source. Record these links for later original-media acquisition; do not hotlink expiring social CDN URLs or publish copied social UI.

## Visual system

**Creative direction:** an intimate mountain-garden dining destination. Luxury should come from authentic photography, carefully paced space, legible editorial typography and confident composition.

- Keep established Day tokens: warm ivory `#F7F3EA`, raised cream `#FEFCF7`, forest text `#183228`, sage `#E3E9E0`, restrained gold `#B38D4D`. Night uses the existing midnight forest, warm ivory and antique gold tokens. Do not introduce an unrelated parallel palette.
- Use one licensed editorial serif for large Latin headings and one highly readable sans family for UI, with a deliberate Urdu-capable family. Choose and verify actual font files/licenses during implementation. Body text 16–18px; desktop hero approximately 56–80px, mobile approximately 36–44px, constrained by real copy. Urdu needs its own line-height and mixed-script testing.
- Content width about 1200–1280px; 24px mobile and 48–72px desktop gutters where space allows; section spacing roughly 56–72px mobile and 88–120px desktop. Use fluid sizing rather than rigid empty heights.
- Buttons about 48px high, calm 4–8px corner radii, strong contrast, clear hover/focus/disabled states. Understated borders and occasional warm shadows. Reserve rounded pills for utility controls or category selection.
- Do not recreate the crest with text/SVG, filter it gold, mirror it in RTL or pretend its illustrated lake/building is a photograph of the real property.

## Page-by-page composition

| Surface | Proposed composition |
| --- | --- |
| Shared desktop header | Compact 80–96px composition; real logo in a forest brand area, concise navigation, English/Urdu and Day/Night utilities, one prominent Request a Table CTA. Header treatment may overlay the homepage hero with a sufficiently opaque backing; inner pages get a solid surface |
| Shared mobile header | Approximately 72–80px row with visible real mark, labelled menu trigger and compact utilities. Accessible drawer with close control, focus management, Escape support, and all public links. Avoid a navigation list consuming the first screen |
| Home | Arrival hero using the real garden photo; brand/tagline and two primary paths (Explore Menu, Request a Table). Follow with a short place/story composition, garden/treehouse/celebration experiences, honest category-level menu teaser, curated gallery only as distinct usable photos exist, visit teaser and final booking/WhatsApp invitation |
| Menu | Short elegant introduction; readable category browsing, search and filters; repaired category image feature with image-size-aware layout; carefully aligned item names, variants and PKR prices in an editorial list. Preserve all published items and no-results states. Avoid 118 identical cards or mislabelling category photography as a selected dish |
| Book / treehouse | Compact atmospheric introduction, seating choice shown as clear cards or radios, form on a quiet readable surface, concise staff-confirmation guidance alongside it. Mobile single column, large inputs, meaningful validation, review state and request receipt |
| Event | Real celebration image if suitable; otherwise honest garden image with neutral alt text. Explain décor from PKR 8,000 and staff confirmation, then a structured enquiry form. Keep cake/outside-food policies accessible; never turn them into invented packages |
| Visit | Real venue image, clear arrival instructions and map-link card, hours/contact block, seating information. Any interactive map should be an enhancement, not a load-blocking embed |
| Concierge | Branded welcome, concise explanation, useful starter questions, readable bubbles, message status, generous composer and visible staff handoff. Keep voice controls behind their existing flags. No fake human-online indicator |
| Privacy | Restrained reading width and information hierarchy; preserve unpublished notice until approved wording exists, and preserve working consent controls |
| Shared footer | Substantial forest background: original logo/tagline; useful page links; verified hours/address; configured WhatsApp; labelled Facebook/Instagram; Privacy/consent access. Responsive grid and calm closing line; no invented email, awards, affiliations or legal text |
| Loading / errors / 404 | Match the shell, typography and spacing. Reserve the next content area's dimensions, show a modest real status indicator, and provide useful recovery navigation |

**First appearance and motion:** show the header, image poster, headline and CTA immediately. Use optional 350–600ms opacity/8–12px entrance motion on a small number of elements, without hiding essential content before JavaScript. Color changes remain 150–200ms. Honor reduced motion. No blocking logo intro, forced loading timer, scroll hijacking, autoplay audio, cursor effects or heavy parallax. A future muted video must have a poster, pause control, no essential copy inside it, and an image fallback; it is not required for this redesign.

## Delivery sequence and completion evidence

1. Recheck working tree and baseline. Inspect needed sources, repair image identity and language-route contracts, inventory usable assets.
2. Implement shared typography, spacing, controls, header/footer and real logo. Render both themes and languages before expanding.
3. Build the complete homepage narrative using the real garden image and correctly sized category imagery.
4. Bring all six inner page types and loading/error states to the same design standard. Keep server/domain behavior intact. Address any journey dead ends explicitly rather than masking them.
5. Verify routes, images, keyboard use, state retention and performance. Produce before/after captures and a short change report.

Acceptance must include actual browser screenshots at 360, 390, 768, 1024 and 1440px with measured viewport confirmation; both languages and both themes on all public routes; no page-level horizontal overflow; readable logo and hero on the first screen; no broken images; all twelve approved category mappings proven against database-shaped data; route/query-preserving language changes; no state reset on theme change; form and menu regressions tested locally or in an isolated preview.

Run relevant existing tests, typecheck/lint/build and the project's required verification gates. Target accessible controls, focus and dialog behavior, contrast, reduced motion, image loading and the existing booking E2E issue. Measure performance rather than claiming scores: aim for LCP ≤2.5s and CLS ≤0.1 under a recorded mobile test profile, and identify lab measurements as lab evidence. Real INP requires suitable interaction/field evidence. Keep the first hero image roughly within 200–350 KB where visual quality permits; lazy-load secondary media and avoid loading a social feed on arrival.

This plan authorizes design implementation through the companion Claude prompt. It does not change production launch approval, publish legal/business copy, enable disabled services, or authorize overwriting concurrent backend work.
