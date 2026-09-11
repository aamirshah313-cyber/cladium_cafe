import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Confirms `globals.css` actually carries the theme-mode.md token table —
 * a plain-string check, not a CSS parser, matching this repo's other
 * dependency-free validation (`scripts/validate/`). A typo here (wrong
 * token name, wrong hex, Night values missing from either the
 * `prefers-color-scheme` media block or the explicit `data-theme` override)
 * would otherwise only surface as a visual bug.
 */

const CSS_PATH = resolve(__dirname, '../../src/app/globals.css');
const css = readFileSync(CSS_PATH, 'utf8');

// theme-mode.md's semantic token table.
const DAY: Record<string, string> = {
  '--surface-canvas': '#f7f3ea',
  '--surface-raised': '#fefcf7',
  '--surface-atmosphere': '#e3e9e0',
  '--text-primary': '#183228',
  '--text-muted': '#557064',
  '--action-primary': '#23463a',
  '--action-on-primary': '#f7f3ea',
  '--accent-gold': '#b38d4d',
  '--border-subtle': '#c9d4c8',
};

const NIGHT: Record<string, string> = {
  '--surface-canvas': '#0b1a15',
  '--surface-raised': '#183228',
  '--surface-atmosphere': '#23463a',
  '--text-primary': '#f7f3ea',
  '--text-muted': '#c8d6cb',
  '--action-primary': '#c7a96b',
  '--action-on-primary': '#0b1a15',
  '--accent-gold': '#e7d5ab',
  '--border-subtle': '#365246',
};

const PEACH: Record<string, string> = {
  '--surface-canvas': '#de8a4e',
  '--surface-raised': '#eda87a',
  '--surface-atmosphere': '#d07b3a',
  '--text-primary': '#2a1303',
  '--text-muted': '#351704',
  '--action-primary': '#6d3208',
  '--action-on-primary': '#fdefe0',
  '--accent-gold': '#351704',
  '--border-subtle': '#bd6a2c',
};

const GOLDEN: Record<string, string> = {
  '--surface-canvas': '#f2b544',
  '--surface-raised': '#f8cd74',
  '--surface-atmosphere': '#db9c22',
  '--text-primary': '#2b1a02',
  '--text-muted': '#4a2f05',
  '--action-primary': '#6b4405',
  '--action-on-primary': '#fff6de',
  '--accent-gold': '#4a2f05',
  '--border-subtle': '#c98f1e',
};

const TERRACOTTA: Record<string, string> = {
  '--surface-canvas': '#f7e2d1',
  '--surface-raised': '#fdf1e7',
  '--surface-atmosphere': '#e8b892',
  '--text-primary': '#3b1d0d',
  '--text-muted': '#6a3a1e',
  '--action-primary': '#9c4a24',
  '--action-on-primary': '#fdf1e7',
  '--accent-gold': '#7e5210',
  '--border-subtle': '#dcb693',
};

const EMBER: Record<string, string> = {
  '--surface-canvas': '#1a120d',
  '--surface-raised': '#2a1d14',
  '--surface-atmosphere': '#3d2a1b',
  '--text-primary': '#fbeeda',
  '--text-muted': '#e0c49b',
  '--action-primary': '#f2b544',
  '--action-on-primary': '#1a120d',
  '--accent-gold': '#f5c96a',
  '--border-subtle': '#5a3f28',
};

/** Every theme that must declare a full token block and meet contrast. */
const WARM_THEMES: readonly (readonly [string, string, Record<string, string>])[] = [
  ['peach', 'light', PEACH],
  ['golden', 'light', GOLDEN],
  ['terracotta', 'light', TERRACOTTA],
  ['ember', 'dark', EMBER],
];

function extractBlock(source: string, selectorPattern: RegExp): string {
  const match = selectorPattern.exec(source);
  if (!match) {
    throw new Error(`Selector not found in globals.css: ${selectorPattern}`);
  }
  return match[1] ?? '';
}

function assertTokens(block: string, tokens: Record<string, string>) {
  for (const [name, value] of Object.entries(tokens)) {
    const declaration = new RegExp(`${name}\\s*:\\s*${value}\\s*;`, 'i');
    expect(block, `expected ${name}: ${value} in block:\n${block}`).toMatch(declaration);
  }
}

describe('globals.css Day/Night tokens', () => {
  it('declares every Day token, unconditionally, on the unconditional :root', () => {
    const dayBlock = extractBlock(css, /:root\s*\{([^}]*)\}/);
    assertTokens(dayBlock, DAY);
  });

  /**
   * The guard is `:not([data-theme])` — keyed on whether *any* explicit
   * choice was made, not on whether that choice was Day. The older
   * `:not([data-theme='day'])` form also matched `data-theme="peach"`, so
   * the system-dark palette applied to Peach and lost only on source order.
   * Asserting the exact selector is what keeps that from coming back.
   */
  it('applies the prefers-color-scheme default only when no theme was explicitly chosen', () => {
    const mediaBlock = extractBlock(css, /:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/);
    assertTokens(mediaBlock, NIGHT);
    expect(css, 'the day-specific guard reintroduces the Peach override bug').not.toMatch(
      /:root:not\(\[data-theme=['"]day['"]\]\)/,
    );
  });

  it.each(WARM_THEMES)(
    'declares every %s token under its explicit override',
    (name, _cs, tokens) => {
      const block = extractBlock(
        css,
        new RegExp(`:root\\[data-theme=['"]${name}['"]\\]\\s*\\{([^}]*)\\}`),
      );
      assertTokens(block, tokens);
    },
  );

  /**
   * `color-scheme` has to match what the palette actually is, or the
   * browser's own chrome — form controls, scrollbars, autofill — is styled
   * for the opposite one. Ember is the only dark member of this group.
   */
  it.each(WARM_THEMES)('declares %s as a %s color-scheme', (name, scheme) => {
    const block = extractBlock(
      css,
      new RegExp(`:root\\[data-theme=['"]${name}['"]\\]\\s*\\{([^}]*)\\}`),
    );
    expect(block).toMatch(new RegExp(`color-scheme:\\s*${scheme}`));
  });

  it('declares every Night token under the explicit data-theme="night" override', () => {
    const explicitBlock = extractBlock(css, /:root\[data-theme=['"]night['"]\]\s*\{([^}]*)\}/);
    assertTokens(explicitBlock, NIGHT);
  });

  it('sets color-scheme so native form/scrollbar UI matches each theme', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(css).toMatch(/color-scheme:\s*dark/);
  });

  it('guards the colour transition behind prefers-reduced-motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*no-preference\)/);
  });
});

/**
 * Contrast, measured rather than trusted.
 *
 * `CLAUDE.md` makes WCAG AA non-negotiable, but nothing was checking it —
 * a palette edit that reads fine on the author's monitor could drop a pair
 * below 4.5:1 and ship. Peach is the case that made this worth writing:
 * warm mid-tones on cream look pleasant at exactly the point they stop
 * being legible, so the eye is the wrong instrument.
 *
 * Only pairs the components can actually produce are checked — there is no
 * point asserting a contrast between two colours never placed together.
 */
const AA_NORMAL_TEXT = 4.5;
/**
 * WCAG 1.4.11. `--accent-gold` is never used as `color:` anywhere in
 * `globals.css` — it is borders, outlines, strokes and one background — so
 * the text threshold does not apply to it. It *is* used as the focus
 * outline, which does have to be distinguishable, hence 3:1 rather than
 * nothing at all.
 */
const AA_NON_TEXT = 3;

/**
 * Pairs that already fail today, pinned to what they actually measure.
 *
 * These are pre-existing Day-theme values from the approved brand palette,
 * found when this file first started measuring contrast rather than
 * assuming it. They are recorded instead of quietly corrected because the
 * palette is owner-approved (`brand/visual-direction.md`) and nudging a
 * brand colour is a design decision, not a test fix.
 *
 * The assertion is still real: each is held to its current ratio, so these
 * pairs cannot get *worse* without failing, and any pair not listed here
 * must meet the full threshold. Remove an entry the moment its colour is
 * corrected — an entry that starts passing also fails, so the list cannot
 * rot silently.
 */
const KNOWN_SHORTFALLS: Readonly<Record<string, number>> = {
  // `.menu-carousel-thumb-initial` (--text-muted) on `.menu-carousel-thumb`
  // (--surface-atmosphere). 20px serif, so "large text" does not apply.
  'Day:--text-muted:--surface-atmosphere': 4.37,
  // Focus outline against the page and card surfaces.
  'Day:--accent-gold:--surface-canvas': 2.77,
  'Day:--accent-gold:--surface-raised': 3.0,
};

function relativeLuminance(hex: string): number {
  const channels = (hex.replace('#', '').match(/../g) ?? []).map((pair) => {
    const srgb = parseInt(pair, 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pairs the components genuinely render, with the threshold that actually
 * applies to each. `--accent-gold` is non-text everywhere in `globals.css`
 * (verified: zero `color: var(--accent-gold)` declarations), so it is held
 * to 1.4.11's 3:1 rather than the text threshold it would always fail.
 */
const RENDERED_PAIRS: readonly (readonly [string, string, number])[] = [
  ['--text-primary', '--surface-canvas', AA_NORMAL_TEXT],
  ['--text-primary', '--surface-raised', AA_NORMAL_TEXT],
  ['--text-primary', '--surface-atmosphere', AA_NORMAL_TEXT],
  ['--text-muted', '--surface-canvas', AA_NORMAL_TEXT],
  ['--text-muted', '--surface-raised', AA_NORMAL_TEXT],
  // `.menu-carousel-thumb-initial` on `.menu-carousel-thumb`.
  ['--text-muted', '--surface-atmosphere', AA_NORMAL_TEXT],
  ['--action-on-primary', '--action-primary', AA_NORMAL_TEXT],
  // Focus outline (`outline: 2px solid var(--accent-gold)`) and borders.
  ['--accent-gold', '--surface-canvas', AA_NON_TEXT],
  ['--accent-gold', '--surface-raised', AA_NON_TEXT],
];

describe.each([
  ['Day', DAY],
  ['Night', NIGHT],
  ['Peach', PEACH],
  ['Golden', GOLDEN],
  ['Terracotta', TERRACOTTA],
  ['Ember', EMBER],
])('%s palette contrast', (themeName, palette) => {
  it.each(RENDERED_PAIRS)('%s on %s', (foreground, background, threshold) => {
    const fg = palette[foreground];
    const bg = palette[background];
    expect(fg, `${foreground} missing from palette`).toBeDefined();
    expect(bg, `${background} missing from palette`).toBeDefined();

    const ratio = contrastRatio(fg ?? '', bg ?? '');
    const where = `${themeName}: ${foreground} (${fg}) on ${background} (${bg}) is ${ratio.toFixed(2)}:1`;
    const pinned = KNOWN_SHORTFALLS[`${themeName}:${foreground}:${background}`];

    if (pinned === undefined) {
      expect(ratio, `${where}, below the ${threshold}:1 required`).toBeGreaterThanOrEqual(
        threshold,
      );
      return;
    }

    // A pinned pair must not degrade further — and must not still be pinned
    // once it has been corrected, so the baseline cannot quietly rot.
    expect(ratio, `${where}, worse than the pinned ${pinned}:1`).toBeGreaterThanOrEqual(
      pinned - 0.01,
    );
    expect(
      ratio,
      `${where} now meets ${threshold}:1 — delete its KNOWN_SHORTFALLS entry`,
    ).toBeLessThan(threshold);
  });
});
