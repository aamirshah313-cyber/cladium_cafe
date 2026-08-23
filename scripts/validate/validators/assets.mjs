import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Confirms every source_assets reference in menu.json points at a real file,
 * and reports (does not fix) known media gaps such as a missing vector logo.
 */
export function validateAssetReferences(sourceAssets, researchRoot) {
  const errors = [];
  const info = [];
  const missing = [];
  const present = [];

  for (const relativePath of sourceAssets ?? []) {
    const fullPath = path.join(researchRoot, relativePath);
    if (existsSync(fullPath)) {
      present.push(relativePath);
    } else {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    for (const missingPath of missing) {
      errors.push(`Referenced source asset not found on disk: ${missingPath}`);
    }
  } else {
    info.push(`All ${present.length} referenced menu source-page images exist on disk.`);
  }

  let logoCount = 0;
  let vectorLogoCount = 0;
  let nonMenuPhotoCount = 0;

  const providedDir = path.join(researchRoot, 'assets', 'provided');
  if (existsSync(providedDir)) {
    for (const entry of readdirSync(providedDir, { withFileTypes: true })) {
      if (entry.isFile() && /logo/i.test(entry.name)) {
        logoCount++;
        if (/\.(svg|ai|pdf)$/i.test(entry.name)) vectorLogoCount++;
      }
    }
    const picturesDir = path.join(providedDir, 'Pictures');
    if (existsSync(picturesDir)) {
      nonMenuPhotoCount += readdirSync(picturesDir).length;
    }
  }
  const officialProfileDir = path.join(researchRoot, 'assets', 'official-profile');
  if (existsSync(officialProfileDir)) {
    nonMenuPhotoCount += readdirSync(officialProfileDir).length;
  }

  info.push(`Logo files found: ${logoCount} (vector/transparent among them: ${vectorLogoCount}). Non-menu photos found: ${nonMenuPhotoCount}.`);
  if (vectorLogoCount === 0) {
    info.push('No vector/transparent logo file found on disk — matches the known Gate 0 media blocker; not a new finding.');
  }

  return {
    errors,
    info,
    summary: { referenced: sourceAssets?.length ?? 0, present: present.length, missing, logoCount, vectorLogoCount, nonMenuPhotoCount },
  };
}
