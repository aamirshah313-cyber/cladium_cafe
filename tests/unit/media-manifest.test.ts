/**
 * The manifest makes two claims per asset that TypeScript cannot check and
 * that fail *silently* in a browser when wrong:
 *
 * - `sourcePath` names the preserved original. It is the whole provenance
 *   record — the answer to "where did this photograph come from". A path
 *   that no longer resolves is not a broken link, it is a lost answer, and
 *   nothing at runtime ever reads it, so nothing would ever notice.
 * - `path`/`thumbPath` name derivatives under `public/`. A missing one
 *   renders as a broken image on a live page.
 *
 * `sourceDirFor` picks the source directory from the file extension, which
 * is true of the two batches that exist today and is not guaranteed of a
 * third. These assertions are what keeps that shortcut honest.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { diningMedia, galleryMedia, venueMedia } from '../../src/modules/brand/media-manifest';
import type { SiteMediaAsset } from '../../src/modules/brand/media-manifest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const all: readonly [string, SiteMediaAsset][] = [
  ...Object.entries(venueMedia),
  ...Object.entries(diningMedia),
];

describe('media manifest', () => {
  it('points every sourcePath at a preserved original that exists', () => {
    const missing = all
      .filter(([, a]) => !existsSync(repoRoot + a.sourcePath))
      .map(([name, a]) => `${name} -> ${a.sourcePath}`);
    expect(missing).toEqual([]);
  });

  it('points every derivative and thumb at a file that exists under public/', () => {
    const missing: string[] = [];
    for (const [name, a] of all) {
      if (!existsSync(`${repoRoot}public${a.path}`)) missing.push(`${name} -> ${a.path}`);
      if (!existsSync(`${repoRoot}public${a.thumbPath}`)) missing.push(`${name} -> ${a.thumbPath}`);
    }
    expect(missing).toEqual([]);
  });

  it('never lists one derivative under two names', () => {
    const paths = all.map(([, a]) => a.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('keeps birthday décor out of the general gallery', () => {
    // Décor in a general gallery reads as something included with a visit.
    // Approved policy is that every arrangement is quoted and staff-
    // confirmed, so these belong on /event and nowhere else.
    const galleryPaths = new Set(galleryMedia.map((a) => a.path));
    expect(galleryPaths.has(venueMedia.birthdaySetupFairy.path)).toBe(false);
    expect(galleryPaths.has(venueMedia.birthdaySetupDinosaur.path)).toBe(false);
  });

  it('marks every food image category-level, never as a named dish', () => {
    for (const [name, a] of Object.entries(diningMedia)) {
      expect(a.provenance, name).toBe('category');
    }
  });
});
