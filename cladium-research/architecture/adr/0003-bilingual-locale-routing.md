# ADR-0003: Explicit /en and /ur locale routing

Status: accepted

## Context

English and Urdu are both mandatory launch languages, with Urdu requiring RTL layout. Rendering must match first paint (no hydration flash), and unreviewed machine-translated Urdu must never reach guests.

## Decision

Explicit, server-rendered `/en/...` and `/ur/...` routes with correct `lang`/`dir`, canonical/`hreflang`/`x-default` metadata, and a visible switcher. Locale preference persists via a small, signed, non-sensitive cookie so SSR matches first paint. Authoritative business text uses owner-reviewed Urdu from the `translations` table, falling back to canonical English when no reviewed Urdu exists — never machine-generated Urdu.

## Rejected alternatives

- **Client-side-only i18n switching** — rejected; breaks server-first rendering, SEO metadata, and cookie-based first-paint matching required by the architecture.
- **Auto-publishing machine-translated Urdu** — rejected; `CLAUDE.md` forbids inventing or silently publishing Urdu for authoritative content.

## Reversible boundary

Locale routing is URL-structural and additive — more locales can be added later without touching the translation-review workflow or domain services.

## Source

`production-architecture-v2.md` §7; `design/localization-and-rtl.md` (routed, not reloaded this step).
