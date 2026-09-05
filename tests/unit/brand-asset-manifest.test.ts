/**
 * Same drift discipline as `menu-media-mapping.test.ts`: the manifest names
 * files and dimensions independently of what is actually on disk, so
 * without this a renamed, deleted, or regenerated-at-a-different-size
 * derivative would only surface as a broken image in front of a guest.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { brandLogo, venueHero, venueHeroBlurPath } from '../../src/modules/brand/asset-manifest';

const allAssets = [...Object.values(brandLogo), ...Object.values(venueHero)];

describe('brand asset manifest', () => {
  it('every referenced file actually exists in public/', () => {
    for (const asset of allAssets) {
      expect(existsSync(`public${asset.path}`), `${asset.path} must exist`).toBe(true);
    }
    expect(existsSync(`public${venueHeroBlurPath}`)).toBe(true);
  });

  it('every declared width/height matches the real encoded image', async () => {
    for (const asset of allAssets) {
      const meta = await sharp(`public${asset.path}`).metadata();
      expect(meta.width, `${asset.path} width`).toBe(asset.width);
      expect(meta.height, `${asset.path} height`).toBe(asset.height);
    }
  });

  it('every asset records the preserved original it came from, and that original still exists', () => {
    for (const asset of allAssets) {
      expect(asset.sourcePath).toMatch(/^cladium-research\/assets\/provided\//);
      expect(existsSync(asset.sourcePath), `${asset.sourcePath} must be preserved`).toBe(true);
    }
  });

  it('references only local public/ paths, never an external or expiring URL', () => {
    for (const asset of allAssets) {
      expect(asset.path).toMatch(/^\/(brand|venue)\//);
    }
  });

  it('keeps the logo square, so the supplied artwork is never stretched', () => {
    for (const logo of Object.values(brandLogo)) {
      expect(logo.width, `${logo.path} must stay square`).toBe(logo.height);
    }
  });

  it('keeps the hero derivative within the performance budget the design brief sets', () => {
    // ~350 KB ceiling: this is the LCP image on the homepage.
    const bytes = statSync(`public${venueHero.wide.path}`).size;
    expect(bytes).toBeLessThan(350 * 1024);
  });

  it('gives every venue photograph real alt text that does not claim a specific dish or award', () => {
    for (const image of Object.values(venueHero)) {
      expect(image.alt.length).toBeGreaterThan(20);
      expect(image.alt).not.toMatch(/award|rated|best|luxur|five.star/i);
    }
  });
});
