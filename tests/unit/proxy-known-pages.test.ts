import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KNOWN_LOCALE_PAGES } from '../../src/proxy';
import { LOCALES } from '../../src/lib/i18n/locale';

/**
 * Guards the one real risk in `proxy.ts`'s Step 45 (D-058) 404 fix: its
 * `KNOWN_LOCALE_PAGES` list is a second source of truth for "what page
 * exists under `[locale]/*`," deliberately independent of the actual
 * `page.tsx` files so the proxy can check it before any rendering starts.
 * A second source of truth can silently drift — this test is what keeps
 * that from happening: it fails the moment a page directory is added or
 * removed under `src/app/[locale]/` without `KNOWN_LOCALE_PAGES` being
 * updated to match, catching the mistake in CI rather than as a live 404
 * regression.
 */
describe('proxy.ts#KNOWN_LOCALE_PAGES stays in sync with the real page directories', () => {
  it('matches every directory under src/app/[locale]/, excluding the catch-all', () => {
    const localeDir = resolve(__dirname, '../../src/app/[locale]');
    const realDirectories = readdirSync(localeDir)
      .filter((entry) => statSync(resolve(localeDir, entry)).isDirectory())
      .filter((entry) => entry !== '[...rest]');

    expect(new Set(realDirectories)).toEqual(new Set(KNOWN_LOCALE_PAGES));
  });
});

/**
 * `proxy.ts`'s `config.matcher` can't reference `LOCALES` directly (Next.js
 * requires the matcher to be statically analyzable at build time), so the
 * locale set is duplicated there as a literal `(en|ur)` pattern. This test
 * is what keeps that duplication honest.
 */
describe('proxy.ts#config.matcher stays in sync with LOCALES', () => {
  it('the locale alternation in the matcher pattern matches LOCALES exactly', async () => {
    const { config } = await import('../../src/proxy');
    const localeMatcher = config.matcher.find((pattern) => pattern.includes('|'));
    expect(localeMatcher).toBeDefined();

    for (const locale of LOCALES) {
      expect(localeMatcher).toContain(locale);
    }
    // Reverse check: nothing extra sits inside the alternation either.
    const alternation = localeMatcher?.match(/\(([^)]+)\)/)?.[1] ?? '';
    expect(alternation.split('|').sort()).toEqual([...LOCALES].sort());
  });
});
