// Built-in Node test runner (node:test) — zero application dependencies.
// Run with: node --test "scripts/validate/**/*.test.mjs"
// (bare `node --test scripts/validate` fails with MODULE_NOT_FOUND on this
// Windows/Node setup; the explicit glob is the verified cross-platform form)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile } from './lib/read-json.mjs';
import { validateBusinessProfile } from './validators/business-profile.mjs';
import {
  validateMenu,
  collectCategoryItems,
  compareToVerifiedBaseline,
  VERIFIED_MENU_BASELINE,
} from './validators/menu.mjs';
import { validateAssetReferences } from './validators/assets.mjs';
import { crossCheckApprovedKnowledge } from './validators/knowledge-cross-check.mjs';

function baselineSummary(overrides = {}) {
  return {
    totalItems: VERIFIED_MENU_BASELINE.totalItems,
    categoryCount: VERIFIED_MENU_BASELINE.categoryCount,
    singlePrice: VERIFIED_MENU_BASELINE.singlePrice,
    variantPrice: VERIFIED_MENU_BASELINE.variantPrice,
    missingPrice: VERIFIED_MENU_BASELINE.missingPrice,
    emptyCategories: [],
    sourceAssetCount: VERIFIED_MENU_BASELINE.sourceAssetCount,
    ...overrides,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const researchRoot = path.join(repoRoot, 'cladium-research');

test('business-profile.json parses and has no validation errors', () => {
  const result = readJsonFile(path.join(researchRoot, 'data', 'business-profile.json'));
  assert.equal(result.ok, true, result.error);
  const { errors, facts } = validateBusinessProfile(result.data);
  assert.deepEqual(errors, []);
  assert.equal(facts.hours, '12 pm–12 am');
  assert.equal(facts.fulfilment.home_delivery, false);
  assert.equal(facts.fulfilment.takeaway, true);
  assert.equal(facts.birthdayAndEventPolicy.decor_starting_price_pkr, 8000);
});

test('menu.json parses, has no validation errors, and matches the verified Step 3 counts', () => {
  const result = readJsonFile(path.join(researchRoot, 'data', 'menu.json'));
  assert.equal(result.ok, true, result.error);
  const { errors, summary } = validateMenu(result.data);
  assert.deepEqual(errors, []);
  assert.equal(summary.totalItems, 118);
  assert.equal(summary.categoryCount, 12);
  assert.equal(summary.singlePrice, 100);
  assert.equal(summary.variantPrice, 18);
  assert.equal(summary.missingPrice, 0);
  assert.deepEqual(summary.emptyCategories, []);
  assert.equal(summary.sourceAssetCount, 8);
  // The live file must never drift from the pinned baseline without a
  // deliberate, reviewed update to VERIFIED_MENU_BASELINE (see D-015).
  assert.deepEqual(compareToVerifiedBaseline(summary), []);
});

test('collectCategoryItems walks both the flat items array and nested groups[].items', () => {
  const category = {
    name: 'Test Category',
    items: [{ name: 'Flat Item', price_pkr: 100 }],
    groups: [
      { name: 'Group A', items: [{ name: 'Grouped Item 1', price_pkr: 200 }] },
      { name: 'Group B', items: [{ name: 'Grouped Item 2', price_pkr: 300 }] },
    ],
  };
  const entries = collectCategoryItems(category);
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((e) => e.group),
    [null, 'Group A', 'Group B'],
  );
  assert.deepEqual(
    entries.map((e) => e.item.name),
    ['Flat Item', 'Grouped Item 1', 'Grouped Item 2'],
  );
});

test('validateMenu treats a category that only has groups (no flat items) as non-empty', () => {
  const syntheticMenu = {
    currency: 'PKR',
    status: 'synthetic test fixture',
    pricing_notice: 'n/a',
    source_assets: Array.from({ length: 8 }, (_, i) => `assets/provided/Menu/page-${i + 1}.jpg`),
    categories: [
      {
        name: 'Grouped Only',
        groups: [
          { name: 'Chicken', items: [{ name: 'Chicken X', price_pkr: 500 }] },
          { name: 'Beef', items: [{ name: 'Beef X', prices_pkr: { half: 600, full: 1100 } }] },
        ],
      },
      { name: 'Genuinely Empty', items: [] },
    ],
  };
  const { errors, summary } = validateMenu(syntheticMenu);
  assert.deepEqual(errors, []);
  assert.equal(summary.totalItems, 2);
  assert.equal(summary.singlePrice, 1);
  assert.equal(summary.variantPrice, 1);
  // Only the genuinely flat-and-empty category should be flagged — the
  // grouped-only category must not be misreported as empty.
  assert.deepEqual(summary.emptyCategories, ['Genuinely Empty']);
});

test('compareToVerifiedBaseline reports no drift when the summary matches the baseline', () => {
  assert.deepEqual(compareToVerifiedBaseline(baselineSummary()), []);
});

test('compareToVerifiedBaseline flags a changed item total as an error', () => {
  const errors = compareToVerifiedBaseline(baselineSummary({ totalItems: 117 }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /totalItems is 117, expected 118/);
});

test('compareToVerifiedBaseline flags a newly-empty category as an error', () => {
  const errors = compareToVerifiedBaseline(baselineSummary({ emptyCategories: ['Steaks'] }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /emptyCategoryCount is 1, expected 0/);
});

test('compareToVerifiedBaseline flags a changed source-asset count as an error', () => {
  const errors = compareToVerifiedBaseline(baselineSummary({ sourceAssetCount: 7 }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sourceAssetCount is 7, expected 8/);
});

test('compareToVerifiedBaseline skips a field whose actual value is null (already reported structurally)', () => {
  const errors = compareToVerifiedBaseline(baselineSummary({ sourceAssetCount: null }));
  assert.deepEqual(errors, []);
});

test('all menu source-asset references exist on disk', () => {
  const result = readJsonFile(path.join(researchRoot, 'data', 'menu.json'));
  assert.equal(result.ok, true, result.error);
  const { errors, summary } = validateAssetReferences(result.data.source_assets, researchRoot);
  assert.deepEqual(errors, []);
  assert.equal(summary.referenced, 8);
  assert.equal(summary.present, 8);
});

test('approved-operations-knowledge.md still states every non-negotiable policy', () => {
  const knowledgePath = path.join(researchRoot, 'agent', 'approved-operations-knowledge.md');
  assert.equal(existsSync(knowledgePath), true);
  const text = readFileSync(knowledgePath, 'utf8');
  const { errors } = crossCheckApprovedKnowledge(text);
  assert.deepEqual(errors, []);
});
