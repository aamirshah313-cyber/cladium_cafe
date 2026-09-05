# Claude Code implementation prompt: Cladium luxury visual redesign

Implement the following request in this repository. Work through the full authorized visual workstream, rather than stopping after proposing a plan.

## User objective and scope

Transform the current Cladium Café & Resort website into a polished international-standard hospitality experience, tailored to its real mountain-garden setting in Abbottabad. The live reference is https://cladium-cafe.vercel.app/en. The current site is functionally substantial but visually unfinished: mostly plain navigation, text-only home, minimal footer, no visible original logo, no atmospheric hero, weak form presentation and basic route-loading text.

Read `cladium-research/design/LUXURY_REDESIGN_AUDIT_AND_PLAN.md` first for the inspected link audit, exact source findings, available resources, sizes, page compositions and acceptance criteria. This prompt and that brief define the current design workstream. They do not replace verified business facts or security contracts.

The user explicitly permits disregarding CONTINUUM token-saving instructions when they prevent important functionality or development. Use memory as a concise index, not as a reason to skip relevant source/asset inspection, stop at an old runbook boundary, or preserve a knowingly unfinished visual component. Historical “this step only,” “assets unavailable,” and “menu unpublished” comments are not current prohibitions. Do not reopen completed unrelated backend work or rewrite the whole application.

## Start correctly

1. Check HEAD, status and diffs before editing. Another Claude session may be working on database dependencies. Preserve unrelated changes; never stash, revert, reset or overwrite them. Use a separate branch/worktree when useful and available. Do not push `master`: it is connected to the live Vercel deployment. Deliver a reviewable local/preview result; publication is a separate action.
2. Read root `CLAUDE.md`, this brief, current relevant task/state excerpts, visual direction, theme, localization and menu-carousel specifications. Inspect actual components and assets. Load only additional authoritative business/architecture sections needed for the change. Do not preload the hundreds of KB of historical decisions.
3. Record a short baseline: public route screenshots, current test failures and the real viewport sizes. The 5 September audit's unit suite passed 1,133 tests, but its task ledger recorded nine failing booking E2E cases. Recheck current results; neither assume a failure is yours nor dismiss one without investigation.

## Creative direction

Build quiet, confident mountain-garden hospitality: authentic greenery and dusk lighting, forest green, warm ivory, restrained antique gold, refined editorial headings and excellent readability. Keep the existing semantic Day/Night palette and locale system. Use real photographic composition and spacing to create luxury.

Develop the existing shell components into a reusable system. Use an approximately 1200–1280px content container, fluid type and section spacing, consistent input/button states, clear content hierarchy and deliberate alignment. Choose a properly licensed serif display family, restrained sans UI family and Urdu-capable text family; use actual font files with a sensible loading strategy. Urdu typography must be equally considered, not merely mirrored English CSS.

Avoid generic dashboard/card grids, excessive gold, glass panels everywhere, unrelated gradients, giant placeholder shapes, invented awards, fake guest quotations or stock mountain resorts. Keep the supplied logo intact. Do not redraw it with a font or an AI image, recolor it, mirror it, or imply that its illustrated building/lake documents the real venue.

## Use the available resources now

- Original high-resolution logo: `cladium-research/assets/provided/Bigger LOGO.jpg` (1254 × 1254). Use it visibly in the header and footer, with suitable placement/size so the artwork does not become an unreadable postage stamp. Preserve aspect ratio and supplied forest field. If a larger brand treatment is needed, give it intentional space rather than distorting it.
- Real garden photograph: `cladium-research/assets/provided/Pictures/713903386_122094484275358962_9090042462749697376_n.jpg` (1536 × 2048). Build the homepage arrival around it. Choose separate responsive focal positions so desktop crops still show the timber counter, lights and garden, and mobile retains the scene. Do not place tiny text over a bright busy region without a reliable overlay/backing.
- Existing category images: `public/menu/*.jpg`; canonical mapping in `src/modules/menu/media-mapping.ts`. They are representative category images, not individual dish photos. Most are only 180–235px wide. Compose them at modest sizes; don't stretch them across 480px panels. The beef image is a very wide 882 × 144 crop and needs its own sensible treatment.
- Original menu sheets: `cladium-research/assets/provided/Menu/`. Preserve these and canonical menu JSON; do not replace data with mock products or OCR guesses.
- Official profiles: https://www.facebook.com/profile.php?id=61590768862564 and https://www.instagram.com/cladium.cafe/. Add their canonical links to the footer. The garden reel https://www.instagram.com/cladium.cafe/reel/DcDvWZRsXUp/ is an atmosphere reference; the inspected version is portrait and captioned. Clean first-party originals can improve later imagery, but obtaining them must not hold up the main redesign. Do not bulk-import collaborator posts or expiring CDN URLs.

Create web derivatives under `public/brand/` and `public/venue/` while retaining originals. Maintain a small typed manifest with source, dimensions, alt text, intended role and crop/focal guidance. Inspect the rendered derivatives. Use local responsive assets with explicit dimensions/sizes; prioritize only the real LCP image, lazy-load secondary images. Never require a live Instagram embed for the homepage to look complete.

## Fix these verified integration issues first

### Menu image lookup

The live categories are database UUIDs. `guest-view-repository.ts` maps database `id` into `MenuViewCategory.id`, while `resolveCategoryMedia(category.id)` expects slug keys like `sandwiches`. The live menu therefore selects the SVG fallback and renders no category image.

Inspect schema and existing stable identifiers, then expose a separate stable media identity in the presentation/read model. Resolve photography by that identity. Preserve database UUIDs in all cart, filters and domain operations; never substitute slugs globally or hardcode staging UUIDs. Add meaningful regression coverage for UUID-backed categories and all 12 known media mappings, including unknown-category fallback. Verify the actual rendered preview contains successfully loaded images, not merely that image files exist.

### Language link context

`site-header.tsx` passes the locale root as `LanguageSwitcher.currentPath`. Clicking Urdu from `/en/menu` currently returns to `/ur`. Make the existing preference flow preserve the actual equivalent route and supported non-sensitive query parameters, including treehouse seating and menu filters/search. Keep redirect validation and locale cookies. Verify both directions. Theme changes must preserve form/cart/chat state; do not introduce new remounts or silently destroy drafts through navigation.

## Build the complete public experience

1. **Shared header and mobile navigation.** Display the original logo; use a composed desktop navigation with one primary Request a Table CTA and readable language/theme utilities. Keep links to Home, Menu, Book, Event, Visit and Concierge. Mobile needs a compact header and labelled accessible menu drawer, Escape/close behavior, focus management and no overflowing utilities. Hide the skip link visually until focus. Use a stable, legible header surface over imagery and on all inner pages.
2. **Shared footer.** Create a substantial forest footer with real brand artwork/tagline, useful page links, configured address/hours, WhatsApp, official Instagram/Facebook and Privacy/consent access. Keep link labels readable and tap targets comfortable. Never invent an email, terms page, phone number, review score or certification. The configured WhatsApp link opens a profile named “Mehran”; record that for owner verification, but do not change the number based on inference.
3. **Homepage.** Build an immediate photographic arrival with real logo/brand identity, existing tagline and two clear actions: Explore Menu and Request a Table. Continue into a short garden/place story, seating/treehouse and birthday experiences, honest category-led dining highlights, gallery only where enough distinct usable media exist, a visit/directions teaser and a final booking/WhatsApp invitation. Do not duplicate the same photo into six cards to simulate a gallery. With limited media, make fewer, stronger sections and use the food images as modest accents.
4. **Menu.** Preserve the published data adapter, all items/variants/prices, search/filter behavior, availability semantics and accessible category selection. Restyle the feature carousel and full menu list together. Align names, variants and prices carefully; give controls breathing room and selected/focus states. Category-level photography needs a clear contextual caption where juxtaposition could imply an exact dish. The existing add action has no finished cart/review destination in the audit: inspect current work before adding anything. Reuse a real implemented destination if one now exists; otherwise report the journey gap and provide existing menu/concierge/WhatsApp paths without inventing checkout or enabling an unreliable order flow.
5. **Book and treehouse.** Design an atmospheric but efficient request page: introductory seating information, a readable form, two clear seating choices and concise staff-confirmation guidance. Preserve all inputs, validations, CSRF/session behavior, review token, duplicate-submit protections and backend statuses. Style loading, errors, review and receipt as carefully as the empty form. Never show “booking confirmed” for a request.
6. **Birthday/event.** Use authentic appropriate photography if available, explain approved décor pricing and staff confirmation, then present the enquiry form cleanly. Keep cake/outside-food policy exact. Do not invent celebration packages, included extras or availability.
7. **Visit.** Add venue imagery and an arrival composition with genuine address/directions, hours, map action and contact/seating guidance. Preserve the verified map destination. A map embed is optional and must not block rendering or add unnecessary tracking.
8. **Concierge.** Present a branded welcome, useful starter questions, readable conversation bubbles, message status and generous composer. Reuse real chat logic, draft review cards and staff handoff. Keep voice flag-gated and accessible; do not create a pretend live agent.
9. **Privacy and system states.** Style Privacy as a calm reading page with existing consent functionality. Preserve the unpublished-policy notice until approved wording exists. Design route loading, no-results, errors and 404 recovery consistently. Replace scaffolding metadata descriptions with truthful page-specific copy; use verified local artwork for appropriate favicon/social-preview assets.

New business/marketing copy must remain grounded in approved facts. Keep approved Urdu UI text; authoritative Urdu menu/policy/legal copy still requires its existing review model. Canonical English fallback may remain with correct language/direction markup. Never silently machine-publish invented Urdu business content to make a screen look finished.

## First paint and motion

Make the real image poster, header, headline and CTA visible immediately. Add restrained progressive enhancement: optional 350–600ms fades with at most 8–12px travel and modest staggering. Keep content visible without JavaScript. Honor `prefers-reduced-motion`; preserve 150–200ms color-only theme transitions. Use stable loading geometry, a modest status indicator and no artificial wait.

Do not add a full-screen logo gate, forced intro timer, autoplay sound, scroll hijacking, intrusive floating widgets or heavy parallax. A future clean venue video is optional: image fallback first, muted/playsInline, pause control, reduced-motion handling and restrained transfer cost. The redesign must succeed with the existing still photograph.

## Preserve business and engineering contracts

Keep Next.js/TypeScript, existing repositories, feature flags, auth, data validation, RLS, published-menu boundary, deterministic totals, customer review and staff confirmation. No invented menu items, prices, promotions, allergens, availability or delivery. No enabling payments, accommodation, voice, marketing or WhatsApp Cloud because a new layout contains space for them. Use request-accurate language. Preserve tracked WhatsApp behavior and its external-navigation notice while improving its presentation.

Do not use a visual redesign as justification to delete tests, remove consent/security restrictions, change production environment variables or replace database services with fixtures. Run behavioral tests with isolated test data and appropriate preview configuration; do not submit fake guest requests to the public deployment for screenshot convenience.

## Work sequence and required evidence

Complete these as successive checkpoints within this authorized workstream:

- A: baseline and asset manifest; fix media identity and locale-link context.
- B: shared typography/tokens/controls, visible real logo, responsive header/footer.
- C: complete homepage and photographic composition.
- D: all inner pages, forms, concierge, loading/errors and truthful metadata.
- E: browser verification, regression checks, performance checks and final handoff.

At checkpoints, keep concise current state and exact next action. Do not stop merely because an older runbook assigned a component to a different step. If a resource is missing, finish every independent part and report the specific missing asset; don't leave a blank section with a promise.

Before calling this complete:

- Capture and visually inspect every public route in English and Urdu and Day and Night. Test measured 360, 390, 768, 1024 and 1440px viewports; do not claim mobile verification if the browser ignored resizing.
- Verify no page-level horizontal overflow, clipped Urdu text, stretched logos, broken images, tiny controls, hidden focus, sticky-header anchor overlap or menu drawer trapping after close.
- Prove the homepage's first viewport contains a legible brand, actual venue image and clear CTA. Show the full footer in screenshots.
- Check menu category transitions/images, search/filter no-results, prices/variants, query-preserving language switching and theme-state retention. Test actual UUID-backed menu data.
- Test local/isolated form loading/validation/review/success/error states and investigate the recorded booking E2E disabled-button issue if it still reproduces. Do not bypass CSRF or validation to make it green.
- Run appropriate existing tests and `npm run typecheck`, `npm run lint`, `npm run build`, plus required project verification gates. Report environmental blockers distinctly from failures. Do not misrepresent skipped integration/live checks as passes.
- Check keyboard navigation, focus management, accessible names, WCAG AA contrast and reduced motion. Measure image loading and layout shift. Record the lab profile; target LCP ≤2.5s and CLS ≤0.1 without claiming field results. Aim for a visually acceptable hero derivative around 200–350 KB; keep secondary media lazy and fonts restrained.
- Provide changed files, before/after screenshots, validation results and any real remaining limitations. Keep rollout/production GO separate from visual completion. Do not auto-push the deployment branch.

The expected result is implemented, coherent design across the whole public website—not another plan, a homepage-only makeover, or a color change around unstyled forms.
