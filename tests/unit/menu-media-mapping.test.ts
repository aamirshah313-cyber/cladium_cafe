import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeMenuSource } from '../../src/modules/menu/adapter';
import { menuCategoryMedia, resolveCategoryMedia } from '../../src/modules/menu/media-mapping';

/**
 * Drift-detection test, same discipline as D-058's `KNOWN_LOCALE_PAGES`
 * check: `menuCategoryMedia`'s keys are a second source of truth for "what
 * real menu categories exist," independent of `menu.json` by necessity
 * (the mapping has to name every category up front). If a category is
 * ever added, renamed, or removed in `menu.json`, this fails loudly
 * instead of silently leaving a stale or missing media-mapping entry.
 */
describe('menuCategoryMedia', () => {
  const raw = readFileSync('cladium-research/data/menu.json', 'utf8');
  const normalized = normalizeMenuSource(raw);
  if (!normalized.ok)
    throw new Error('menu.json failed to normalize — fix the source, not this test');
  const realCategoryIds = normalized.value.categories.map((category) => category.stableId).sort();

  it('has exactly one entry per real menu.json category, no more, no fewer', () => {
    expect(Object.keys(menuCategoryMedia).sort()).toEqual(realCategoryIds);
  });

  it('every non-null entry is a public/-relative path with real alt text', () => {
    for (const [categoryId, media] of Object.entries(menuCategoryMedia)) {
      if (media === null) continue;
      expect(media.assetPath, `${categoryId} assetPath`).toMatch(/^\/menu\//);
      expect(media.alt.length, `${categoryId} alt text`).toBeGreaterThan(0);
    }
  });

  it('every referenced assetPath points to a file that actually exists in public/ — never a broken/invented reference', () => {
    for (const [categoryId, media] of Object.entries(menuCategoryMedia)) {
      if (media === null) continue;
      const onDiskPath = `public${media.assetPath}`;
      expect(existsSync(onDiskPath), `${categoryId}: ${onDiskPath} must exist on disk`).toBe(true);
    }
  });

  it("confirms the real category count/shape this module's doc comment claims (12 categories)", () => {
    expect(realCategoryIds).toHaveLength(12);
  });
});

describe('resolveCategoryMedia', () => {
  it('resolves a real, approved image for a known category', () => {
    const media = resolveCategoryMedia('sandwiches');
    expect(media).not.toBeNull();
    expect(media?.assetPath).toBe('/menu/sandwiches.jpg');
  });

  it('returns null for an unknown category id rather than throwing', () => {
    expect(resolveCategoryMedia('not-a-real-category')).toBeNull();
  });
});

/**
 * Guards the identity contract this mapping depends on, which a live
 * published menu broke silently: `MenuViewCategory.id` is the database
 * UUID, so looking media up by it always missed and every category fell
 * back to the decorative placeholder. `mediaKey` carries the stable slug
 * (`menu_categories.stable_id`) for exactly this lookup. A UUID must never
 * resolve media, and every real category must resolve through `mediaKey`.
 */
describe('media identity contract (UUID id vs stable mediaKey)', () => {
  const raw = readFileSync('cladium-research/data/menu.json', 'utf8');
  const normalized = normalizeMenuSource(raw);
  if (!normalized.ok) throw new Error('menu.json failed to normalize');
  const realCategoryIds = normalized.value.categories.map((c) => c.stableId);

  it('resolves an image for all 12 real categories when keyed by mediaKey', () => {
    for (const stableId of realCategoryIds) {
      expect(resolveCategoryMedia(stableId), `${stableId} must resolve media`).not.toBeNull();
    }
  });

  it('resolves nothing for database UUIDs — the exact live defect this guards', () => {
    // Shaped like the real read model's `id`, which must never be the lookup key.
    expect(resolveCategoryMedia('eea04428-b1ae-4aa4-8c25-5646e9fccec0')).toBeNull();
  });

  it('falls back gracefully for a category with no mapping rather than throwing', () => {
    expect(resolveCategoryMedia('')).toBeNull();
  });
});
