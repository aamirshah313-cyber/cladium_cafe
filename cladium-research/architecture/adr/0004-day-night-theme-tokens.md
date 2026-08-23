# ADR-0004: Day/Night themes via semantic design tokens

Status: accepted

## Context

Day and Night themes are mandatory and must be accessible and flash-free. Theme changes must never alter logo artwork, price data, cart/booking state, or language choice.

## Decision

Semantic design tokens and CSS logical properties implement both themes. Initial render is server-aligned from a signed, non-sensitive theme cookie so there is no flash. The theme control is keyboard-accessible with visible focus and respects reduced-motion; switching themes only changes presentation tokens, never content, prices, or workflow state.

## Rejected alternatives

- **OS-preference-only automatic switching mid-session** — rejected; the architecture explicitly avoids automatic mid-session theme changes.
- **Separate markup/content per theme** — rejected; duplicates maintenance and risks violating the "never alter logo artwork/price data" rule.

## Reversible boundary

Theme tokens are a pure CSS-layer concern, decoupled from business logic; adding more themes later doesn't touch domain code.

## Source

`production-architecture-v2.md` §7; `design/theme-mode.md` (routed, not reloaded this step).
