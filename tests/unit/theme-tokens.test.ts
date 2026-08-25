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

  it('declares every Night token under the prefers-color-scheme first-visit default, guarded against an explicit Day choice', () => {
    const mediaBlock = extractBlock(css, /:root:not\(\[data-theme=['"]day['"]\]\)\s*\{([^}]*)\}/);
    assertTokens(mediaBlock, NIGHT);
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
