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
 *
 * Step 35 extends coverage to all four pages that carry a click-to-
 * WhatsApp link (home, visit, menu-unpublished, privacy) and asserts each
 * routes through the hardened `buildWhatsAppUrl` link builder rather than
 * the bare `WHATSAPP_URL` constant.
 *
 * Step 45 (D-051 follow-up, closing a Step 37/D-041 tracked item): all four
 * pages now render their WhatsApp anchor through the shared
 * `TrackedWhatsAppLink` component (`app/[locale]/tracked-whatsapp-link.tsx`)
 * rather than an inline `<a>`, so the literal anchor tag itself moved out of
 * each page's own source — the `rel="noopener noreferrer"` safety check
 * below now targets that one shared component directly, and each page is
 * checked for using it rather than for containing a literal anchor.
 * `visit/page.tsx` keeps its own separate check too: its Google Maps link
 * is still a real, page-local `<a target="_blank">`, unaffected by this
 * refactor.
 */

const WHATSAPP_LINK_COMPONENT = resolve(
  __dirname,
  '../../src/app/[locale]/tracked-whatsapp-link.tsx',
);

const PAGES_WITH_WHATSAPP_LINK = [
  resolve(__dirname, '../../src/app/[locale]/visit/page.tsx'),
  resolve(__dirname, '../../src/app/[locale]/page.tsx'),
  resolve(__dirname, '../../src/app/[locale]/menu/page.tsx'),
  resolve(__dirname, '../../src/app/[locale]/privacy/page.tsx'),
];

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

function externalAnchorsIn(source: string): readonly string[] {
  const anchorPattern = /<a\b[^>]*>/g;
  const anchors = source.match(anchorPattern) ?? [];
  return anchors.filter((tag) => tag.includes('target="_blank"'));
}

describe('external links carry noopener noreferrer', () => {
  it('the shared TrackedWhatsAppLink anchor is safe', () => {
    const externalAnchors = externalAnchorsIn(readSource(WHATSAPP_LINK_COMPONENT));
    expect(externalAnchors.length).toBeGreaterThan(0);
    for (const anchor of externalAnchors) {
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });

  it("the visit page's own Google Maps anchor is safe", () => {
    const path = resolve(__dirname, '../../src/app/[locale]/visit/page.tsx');
    const externalAnchors = externalAnchorsIn(readSource(path));
    expect(externalAnchors.length).toBeGreaterThan(0);
    for (const anchor of externalAnchors) {
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });
});

describe('external links point at the approved destinations', () => {
  it('the visit page links to the confirmed Google Maps URL', () => {
    const source = readSource(resolve(__dirname, '../../src/app/[locale]/visit/page.tsx'));
    expect(source).toContain('GOOGLE_MAPS_URL');
    // Re-asserts the constant itself hasn't drifted from the confirmed
    // value (business-facts.test.ts owns the primary check).
    expect(GOOGLE_MAPS_URL).toMatch(/^https:\/\/maps\.app\.goo\.gl\//);
  });

  it.each(PAGES_WITH_WHATSAPP_LINK)(
    'the click-to-WhatsApp link in %s uses the hardened buildWhatsAppUrl, not the bare constant',
    (path) => {
      const source = readSource(path);
      expect(source).toContain('buildWhatsAppUrl');
      expect(source).not.toMatch(/href=\{WHATSAPP_URL\}/);
      // Re-asserts the underlying business fact hasn't drifted.
      expect(WHATSAPP_URL).toMatch(/^https:\/\/wa\.me\//);
    },
  );

  it.each(PAGES_WITH_WHATSAPP_LINK)(
    'the click-to-WhatsApp link in %s carries a visible external-navigation notice',
    (path) => {
      const source = readSource(path);
      expect(source).toContain('whatsappExternalNoticeText');
    },
  );

  it.each(PAGES_WITH_WHATSAPP_LINK)(
    'the click-to-WhatsApp link in %s is wired through TrackedWhatsAppLink, not a bare anchor',
    (path) => {
      const source = readSource(path);
      expect(source).toContain('TrackedWhatsAppLink');
      expect(source).not.toMatch(/<a href=\{buildWhatsAppUrl/);
    },
  );
});
