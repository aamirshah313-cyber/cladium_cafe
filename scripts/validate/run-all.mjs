#!/usr/bin/env node
// Read-only validation runner. Reads source data and reports; it never
// writes to, or invents values for, business-profile.json or menu.json.
// The only file this script writes is the generated report below.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile } from './lib/read-json.mjs';
import { validateBusinessProfile } from './validators/business-profile.mjs';
import {
  validateMenu,
  compareToVerifiedBaseline,
  VERIFIED_MENU_BASELINE,
} from './validators/menu.mjs';
import { validateAssetReferences } from './validators/assets.mjs';
import { crossCheckApprovedKnowledge } from './validators/knowledge-cross-check.mjs';

const SOURCE_FILES_READ = [
  'cladium-research/data/business-profile.json',
  'cladium-research/data/menu.json',
  'cladium-research/agent/approved-operations-knowledge.md',
  'cladium-research/assets/provided/Menu/*.jpg (existence check only)',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const researchRoot = path.join(repoRoot, 'cladium-research');

let hardFailure = false;
const reportSections = [];

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function logResults(errors, warnings = [], info = []) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  for (const w of warnings) console.warn(`WARN:  ${w}`);
  for (const i of info) console.log(`INFO:  ${i}`);
}

function mdList(items) {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '_(none)_';
}

// ---- business-profile.json -------------------------------------------------
section('business-profile.json');
const profileResult = readJsonFile(path.join(researchRoot, 'data', 'business-profile.json'));
let profileFacts = {};
if (!profileResult.ok) {
  console.error(`ERROR: ${profileResult.error}`);
  hardFailure = true;
  reportSections.push(`## business-profile.json\n\n**FAILED TO PARSE:** ${profileResult.error}\n`);
} else {
  const { errors, warnings, facts } = validateBusinessProfile(profileResult.data);
  profileFacts = facts;
  logResults(errors, warnings);
  console.log(
    errors.length === 0
      ? 'PASS: all required confirmed facts present and correct.'
      : `FAIL: ${errors.length} error(s).`,
  );
  if (errors.length > 0) hardFailure = true;
  reportSections.push(
    `## business-profile.json\n\n` +
      `**Errors (${errors.length}):**\n${mdList(errors)}\n\n` +
      `**Warnings (${warnings.length}):**\n${mdList(warnings)}\n\n` +
      `**Confirmed facts read:** hours "${facts.hours ?? 'MISSING'}", takeaway=${facts.fulfilment?.takeaway}, home_delivery=${facts.fulfilment?.home_delivery}, décor floor PKR ${facts.birthdayAndEventPolicy?.decor_starting_price_pkr}, cakes_provided=${facts.birthdayAndEventPolicy?.cakes_provided}, outside_food_allowed=${facts.birthdayAndEventPolicy?.outside_food_allowed}, whatsapp=${facts.whatsapp}.\n`,
  );
}

// ---- menu.json --------------------------------------------------------------
section('menu.json');
const menuResult = readJsonFile(path.join(researchRoot, 'data', 'menu.json'));
let menuSummary = null;
if (!menuResult.ok) {
  console.error(`ERROR: ${menuResult.error}`);
  hardFailure = true;
  reportSections.push(`## menu.json\n\n**FAILED TO PARSE:** ${menuResult.error}\n`);
} else {
  const { errors: structuralErrors, warnings, info, summary } = validateMenu(menuResult.data);
  menuSummary = summary;

  section('menu.json — baseline drift check');
  const driftErrors = compareToVerifiedBaseline(summary);
  logResults(driftErrors);
  console.log(
    driftErrors.length === 0
      ? `PASS: matches the Step 3 verified baseline exactly (${Object.entries(
          VERIFIED_MENU_BASELINE,
        )
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}).`
      : `FAIL: ${driftErrors.length} field(s) drifted from the verified baseline.`,
  );

  const errors = [...structuralErrors, ...driftErrors];
  logResults(structuralErrors, warnings, info);
  console.log(
    `Summary: ${summary.totalItems} items / ${summary.categoryCount} categories / ${summary.singlePrice} single-price / ${summary.variantPrice} variant-price / ${summary.missingPrice} missing price.`,
  );
  console.log(
    errors.length === 0
      ? 'PASS: menu structure, price shapes, and duplicate-name checks passed.'
      : `FAIL: ${errors.length} error(s).`,
  );
  if (errors.length > 0) hardFailure = true;

  const categoryTable = summary.categorySummaries
    .map((c) => `| ${c.name} | ${c.itemCount} |`)
    .join('\n');
  reportSections.push(
    `## menu.json\n\n` +
      `**Totals:** ${summary.totalItems} items, ${summary.categoryCount} categories, ${summary.singlePrice} single-price, ${summary.variantPrice} variant-price, ${summary.missingPrice} missing price, empty categories: ${summary.emptyCategories.join(', ') || 'none'}.\n\n` +
      `| Category | Items |\n| --- | --- |\n${categoryTable}\n\n` +
      `**Baseline drift check (against \`VERIFIED_MENU_BASELINE\`):** ${driftErrors.length === 0 ? 'PASS — no drift.' : `FAIL — ${driftErrors.length} field(s) drifted:`}\n${driftErrors.length ? mdList(driftErrors) : ''}\n\n` +
      `**Errors (${errors.length}):**\n${mdList(errors)}\n\n` +
      `**Warnings (${warnings.length}):**\n${mdList(warnings)}\n\n` +
      `**Notes:**\n${mdList(info)}\n`,
  );

  // ---- source asset references ----------------------------------------------
  section('menu source-asset references');
  const assetResult = validateAssetReferences(menuResult.data.source_assets, researchRoot);
  logResults(assetResult.errors, [], assetResult.info);
  console.log(
    assetResult.errors.length === 0
      ? 'PASS: all referenced source images exist on disk.'
      : `FAIL: ${assetResult.errors.length} error(s).`,
  );
  if (assetResult.errors.length > 0) hardFailure = true;
  reportSections.push(
    `## Menu source-asset references\n\n` +
      `**Errors (${assetResult.errors.length}):**\n${mdList(assetResult.errors)}\n\n` +
      `**Notes:**\n${mdList(assetResult.info)}\n`,
  );
}

// ---- approved-operations-knowledge.md cross-check ---------------------------
section('approved-operations-knowledge.md cross-check');
const knowledgePath = path.join(researchRoot, 'agent', 'approved-operations-knowledge.md');
if (!existsSync(knowledgePath)) {
  console.error('ERROR: approved-operations-knowledge.md not found.');
  hardFailure = true;
  reportSections.push('## approved-operations-knowledge.md cross-check\n\n**FILE NOT FOUND.**\n');
} else {
  const text = readFileSync(knowledgePath, 'utf8');
  const { errors, info } = crossCheckApprovedKnowledge(text);
  logResults(errors, [], info);
  console.log(
    errors.length === 0
      ? 'PASS: all required policy phrases present.'
      : `FAIL: ${errors.length} error(s).`,
  );
  if (errors.length > 0) hardFailure = true;
  reportSections.push(
    `## approved-operations-knowledge.md cross-check\n\n` +
      `**Errors (${errors.length}):**\n${mdList(errors)}\n\n` +
      `**Notes:**\n${mdList(info)}\n`,
  );
}

// ---- owner signoff report ----------------------------------------------------
const reportDir = path.join(researchRoot, 'data', 'validation');
mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, 'owner-signoff-report.md');
const generatedAt = new Date().toISOString();

const signoffChecklist = [
  '[ ] Confirm all 118 transcribed menu items, their categories/groups, and all prices (PKR) against the original menu images/POS export.',
  '[ ] If this report ever shows a FAIL under "baseline drift check" or lists a category with zero items, treat it as a transcription gap or unreviewed source-data change (never both fixed and silently rebaselined) and supply corrections only from source material — this tooling will not invent them.',
  '[ ] Approve publishable Urdu translations for menu items and policies (none exist yet; canonical English remains the fallback).',
  '[ ] Confirm the primary public phone number and the official WhatsApp number.',
  '[ ] Confirm tax/service-charge rate and when it applies (source data currently only states charges "are applicable," with no rate).',
  '[ ] Confirm takeaway accept/prepare/pickup/reject/cancel and staff-notification procedures.',
  '[ ] Confirm table/treehouse confirm/decline/cancel/no-show rules and capacity.',
  '[ ] Confirm birthday/event quote, confirmation, cancellation, and décor wording.',
  '[ ] Supply a transparent/vector logo and a rights-approved photo library (none found on disk; only raster JPG logos and 2 photos exist today).',
  '[ ] Approve privacy notice, retention/deletion, and consent wording.',
];

const reportBody = `# Cladium menu/business owner sign-off report

- **Generated at (UTC, ISO 8601):** ${generatedAt}
- **Generated by:** \`scripts/validate/run-all.mjs\` — a read-only script: it only reads the files listed below and checks their existence/shape/content on disk; it does not write to, translate, price, or otherwise modify any of them. The only file it writes is this report.
- **Source files read (unmodified):**
${SOURCE_FILES_READ.map((f) => `  - \`${f}\``).join('\n')}
- **Overall result:** **${hardFailure ? 'FAIL — see errors below' : 'PASS'}**

Every count below reflects the source files exactly as they were on disk at the timestamp above. Nothing was invented or filled in to make counts look complete; empty categories, baseline drift, and unresolved facts are listed for owner/engineer action, not silently fixed.

${reportSections.join('\n---\n\n')}

---

## Owner sign-off checklist

${signoffChecklist.join('\n')}

Sign-off does not happen in this file — it happens when the owner/manager explicitly approves via the process in \`release-gates-v2.md\` Gate 0. This report only aggregates what needs review.
`;

writeFileSync(reportPath, reportBody, 'utf8');
console.log(`\nReport written to ${path.relative(repoRoot, reportPath)}`);
console.log(hardFailure ? '\nRESULT: FAIL (see ERROR lines above)' : '\nRESULT: PASS');

process.exit(hardFailure ? 1 : 0);
