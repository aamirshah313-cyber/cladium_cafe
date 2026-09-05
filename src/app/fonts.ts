/**
 * The site's three type families, all SIL Open Font License and all
 * **self-hosted**: `next/font/google` downloads the actual font files at
 * build time and serves them from this origin, so no guest's browser ever
 * requests a Google server, and no third party sees a visitor's IP. That is
 * both a licensing and a privacy property, not only a performance one.
 *
 * - `fontSerif` (Cormorant Garamond) — the editorial display face for Latin
 *   headings. Chosen to sit beside the supplied crest's own high-contrast
 *   serif wordmark without imitating or attempting to recreate it.
 * - `fontSans` (Inter) — calm UI/body face: navigation, controls, forms,
 *   prices. Deliberately quiet, so the photography and headings carry the
 *   luxury rather than the interface.
 * - `fontUrdu` (Noto Nastaliq Urdu) — a real Nastaliq family, so Urdu is
 *   typeset properly rather than being English CSS with different glyphs
 *   (`design/localization-and-rtl.md`). Nastaliq needs far more vertical
 *   room than Latin, which `globals.css` gives it via `[lang='ur']`.
 *
 * `display: 'swap'` everywhere: the real text is visible immediately in a
 * fallback face rather than being invisible while a font loads — the brief
 * requires the headline and CTA to be legible on first paint.
 */

import { Cormorant_Garamond, Inter, Noto_Nastaliq_Urdu } from 'next/font/google';

export const fontSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-serif',
});

export const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const fontUrdu = Noto_Nastaliq_Urdu({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-urdu',
});

/** Applied together on `<html>` so every family is available to CSS as a variable. */
export const fontVariables = `${fontSerif.variable} ${fontSans.variable} ${fontUrdu.variable}`;
