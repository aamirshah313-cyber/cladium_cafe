# Day and Night theme specification

## Launch requirement

Cladium ships with deliberate **Day** and **Night** modes. The theme is a guest-facing visual preference, separate from language. Use a persistent, accessible `Day | Night` control in the header and mobile navigation, with an optional first-visit default from `prefers-color-scheme`.

Never automatically switch a guest mid-session due to local clock time. A user’s chosen preference wins over the system setting and persists in a privacy-safe local preference.

## Theme roles

| Semantic token | Day | Night | Role |
| --- | --- | --- | --- |
| `--surface-canvas` | `#F7F3EA` | `#0B1A15` | main background |
| `--surface-raised` | `#FEFCF7` | `#183228` | cards and panels |
| `--surface-atmosphere` | `#E3E9E0` | `#23463A` | image stages/decorative areas |
| `--text-primary` | `#183228` | `#F7F3EA` | headings/body |
| `--text-muted` | `#557064` | `#C8D6CB` | secondary text |
| `--action-primary` | `#23463A` | `#C7A96B` | primary actions |
| `--action-on-primary` | `#F7F3EA` | `#0B1A15` | action text |
| `--accent-gold` | `#B38D4D` | `#E7D5AB` | premium detail/focus accents |
| `--border-subtle` | `#C9D4C8` | `#365246` | dividers and inactive outlines |

These are working tokens. Run WCAG AA contrast checks against the final typography and component states before release. Do not use gold alone for small Day-mode body text.

## Visual direction

- **Day:** airy warm ivory, sage, and stone; suitable for daytime browsing and the lighter menu carousel. Use the dark logo artwork as supplied against an appropriate neutral surface.
- **Night:** tranquil midnight forest, soft gold, and warm mist; suitable for Cladium's garden lighting and mountain-resort atmosphere. Use the supplied logo without recolouring it.
- Theme changes alter tokens only. They must not replace brand assets, create a new logo, change photographs, or reduce menu-data legibility.
- Use the same component hierarchy in both themes. Avoid a generic black “dark mode”; Night should feel intentional and premium.

## Interaction and accessibility

1. Control is a labelled segmented button or menu, not icon-only. A sun/moon icon may supplement text.
2. It is keyboard accessible, announces the selected mode, has visible focus, and honours `prefers-reduced-motion`.
3. Theme transition is 150–200ms for colours only; no large movement, flashing, or automatic time-triggered transition.
4. Maps, embedded content, media overlays, image alt text, loading states, error states, forms, cart, chatbot, and Vapi controls are checked in both themes.
5. Changing theme preserves current route, selected locale, scroll position when practical, cart, form drafts, voice state, and request state.

## Required tests

- Day and Night render all public routes at 360px, 768px, 1024px, and desktop widths.
- Text, buttons, input borders, focus rings, toast/error states, menu carousel, map section, chatbot, and voice controls pass contrast/visibility review in both modes.
- `prefers-color-scheme` is only a first-visit default; a manual choice persists and is reversible.
- Theme changes never leak personal data, alter business facts, or reset a cart/booking request/language choice.
