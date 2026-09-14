/**
 * Per-item menu photography is keyed by `menu_items.stable_id`, which is
 * derived from the category, group and item *names* in `menu.json`
 * (`modules/menu/adapter.ts`). That makes the key stable across imports —
 * the whole reason it is used instead of the row UUID — but not stable
 * across an editorial rename.
 *
 * So a rename is exactly the failure this file exists to catch. Renaming
 * "Chicken Handi" would change its stable id, `menuItemMedia` would stop
 * matching, and the carousel would silently fall back to the category
 * photo. Nothing would throw, no build would break, and the dish would
 * quietly lose its photograph — the same class of silent-miss defect the
 * id-space bug was.
 *
 * These assertions run the real adapter over the real `menu.json` rather
 * than a fixture, because a fixture asserting its own slugs would prove
 * only that the test agrees with itself.
 */

import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeMenuSource } from '../../src/modules/menu/adapter';
import {
  menuItemMedia,
  resolveCategoryMedia,
  resolveGroupMedia,
  resolveItemThumb,
} from '../../src/modules/menu/media-mapping';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const parsed = normalizeMenuSource(
  readFileSync(new URL('../../cladium-research/data/menu.json', import.meta.url), 'utf8'),
);
if (!parsed.ok) throw new Error(`menu.json failed to normalize: ${parsed.error.code}`);
const itemStableIds = new Set(parsed.value.items.map((i) => i.stableId));

describe('menuItemMedia', () => {
  it('keys every entry to an item that really exists in menu.json', () => {
    const orphans = Object.keys(menuItemMedia).filter((key) => !itemStableIds.has(key));
    expect(orphans).toEqual([]);
  });

  it('is not empty, so the resolution chain is actually exercised', () => {
    expect(Object.keys(menuItemMedia).length).toBeGreaterThan(0);
  });

  it('gives every entry a distinct image, never one photo under two dish names', () => {
    const paths = Object.values(menuItemMedia).map((m) => m.assetPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('records a real thumb path alongside every full-size path', () => {
    for (const [key, media] of Object.entries(menuItemMedia)) {
      expect(media.assetPath, key).toMatch(/^\/menu\/items\/.+\.webp$/);
      expect(media.thumbPath, key).toMatch(/^\/menu\/items\/.+-thumb\.webp$/);
      expect(media.width, key).toBeGreaterThan(0);
      expect(media.height, key).toBeGreaterThan(0);
    }
  });

  it('ships every file it references, at both sizes', () => {
    const missing: string[] = [];
    for (const [key, m] of Object.entries(menuItemMedia)) {
      if (!existsSync(`${repoRoot}public${m.assetPath}`)) missing.push(`${key} -> ${m.assetPath}`);
      if (!existsSync(`${repoRoot}public${m.thumbPath}`)) missing.push(`${key} -> ${m.thumbPath}`);
    }
    expect(missing).toEqual([]);
  });

  it('never claims a dish name the alt text contradicts being a single plate', () => {
    // Alt text is a statement about one dish here (unlike the category and
    // group tiers), so it must not be empty or a placeholder.
    for (const [key, media] of Object.entries(menuItemMedia)) {
      expect(media.alt.trim().length, key).toBeGreaterThan(10);
    }
  });
});

/**
 * The carousel picks a photograph by walking item → group → category and
 * taking the first hit (`menu-feature-carousel.tsx`). That precedence is
 * the honesty rule in code: the most specific *true* statement wins, and
 * each step down is a weaker claim rather than a false one.
 *
 * These reproduce that walk against the real maps, including the failure
 * that made the item tier unusable until now — resolving by the database
 * UUID instead of the stable id, which silently returns nothing.
 */
describe('photo resolution precedence', () => {
  const chain = (mediaKey: string, categoryMediaKey: string, groupLabel: string | null) =>
    menuItemMedia[mediaKey]?.assetPath ??
    resolveGroupMedia(categoryMediaKey, groupLabel)?.assetPath ??
    resolveCategoryMedia(categoryMediaKey)?.assetPath ??
    null;

  it('prefers the dish photo over its group and category', () => {
    // Chicken Handi has its own photograph and sits in Desi Cuisine, which
    // also has one. The dish must win.
    expect(chain('desi-cuisine.chicken-handi', 'desi-cuisine', null)).toBe(
      '/menu/items/desi-cuisine.chicken-handi.webp',
    );
    expect(resolveCategoryMedia('desi-cuisine')?.assetPath).toBe('/menu/desi-cuisine.jpg');
  });

  it('falls back to the group photo for a dish that has none', () => {
    // No BBQ item has its own photograph; Beef has a group one.
    expect(chain('bbq.beef.beef-seekh-kabab', 'bbq', 'Beef')).toBe('/menu/bbq.beef.jpg');
  });

  it('falls back to the category photo when neither dish nor group has one', () => {
    expect(chain('starters.something-with-no-photo', 'starters', null)).toBe('/menu/starters.jpg');
  });

  it('resolves nothing for a database UUID — the defect that kept this tier dark', () => {
    // `MenuViewItem.id` is a row UUID regenerated on every import. Keying
    // the item map by it is why `menuItemMedia` could never match, and is
    // the exact bug `mediaKey` exists to prevent.
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(menuItemMedia[uuid]).toBeUndefined();
    expect(resolveItemThumb(uuid)).toBeNull();
  });

  it('returns the square thumb, not the full-size image, for the rail', () => {
    const key = 'desi-cuisine.chicken-handi';
    expect(resolveItemThumb(key)).toBe(menuItemMedia[key]!.thumbPath);
    expect(resolveItemThumb(key)).not.toBe(menuItemMedia[key]!.assetPath);
  });
});
