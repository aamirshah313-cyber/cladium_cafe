import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOOGLE_MAPS_URL, WHATSAPP_URL } from '../../src/modules/business/facts';

/**
 * Runbook Step 16 evidence: "external-link/security tests pass." A
 * dependency-free source scan (matching `theme-tokens.test.ts`'s approach),
 * not a rendered-DOM test — this repo has no React testing library yet
 * (see Step 14's decision to test UI live in a browser instead). This
 * catches the specific, easy-to-drop mistake: an external `target="_blank"`
 * link missing `rel="noopener noreferrer"`, which lets the destination page
 * reach back into this tab via `window.opener` (reverse tabnabbing).
 */

const FILES_WITH_EXTERNAL_LINKS = [
  resolve(__dirname, '../../src/app/[locale]/visit/page.tsx'),
  resolve(__dirname, '../../src/app/[locale]/page.tsx'),
];

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('external links carry noopener noreferrer', () => {
  it.each(FILES_WITH_EXTERNAL_LINKS)('every target="_blank" anchor in %s is safe', (path) => {
    const source = readSource(path);
    const anchorPattern = /<a\b[^>]*>/g;
    const anchors = source.match(anchorPattern) ?? [];
    const externalAnchors = anchors.filter((tag) => tag.includes('target="_blank"'));

    expect(externalAnchors.length).toBeGreaterThan(0);
    for (const anchor of externalAnchors) {
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });
});

describe('external links point at the approved destinations', () => {
  it('the visit page links to the confirmed Google Maps URL and WhatsApp URL', () => {
    const source = readSource(resolve(__dirname, '../../src/app/[locale]/visit/page.tsx'));
    expect(source).toContain('GOOGLE_MAPS_URL');
    expect(source).toContain('WHATSAPP_URL');
    // Re-asserts the constants themselves haven't drifted from the
    // confirmed values (business-facts.test.ts owns the primary check).
    expect(GOOGLE_MAPS_URL).toMatch(/^https:\/\/maps\.app\.goo\.gl\//);
    expect(WHATSAPP_URL).toMatch(/^https:\/\/wa\.me\//);
  });
});
