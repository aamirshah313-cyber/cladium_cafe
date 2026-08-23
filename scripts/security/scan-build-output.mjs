#!/usr/bin/env node
// Verifies that nothing server-only leaked into the browser bundle.
//
// Two checks over .next/static (the only output actually shipped to a
// visitor's browser):
//   1. the generic secret patterns, and
//   2. the literal value of any server-only env var that happens to be set
//      in this process — the case that matters most, because Next.js inlines
//      values, not names.
//
// Values are never printed. Run after `next build`.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SECRET_PATTERNS, BINARY_EXTENSIONS, findSecrets } from './patterns.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const clientOutputDir = path.join(repoRoot, '.next', 'static');

/** Server-only names from .env.example — none of these values may reach the browser. */
const SERVER_ONLY_ENV_VARS = [
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  'CRON_SECRET',
  'ANTHROPIC_API_KEY',
  'VAPI_ORG_ID',
  'VAPI_PRIVATE_KEY',
  'VAPI_ASSISTANT_EN_ID',
  'VAPI_ASSISTANT_UR_ID',
  'VAPI_WEBHOOK_HMAC_SECRET',
  'META_CONVERSIONS_API_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
];

/** Too-short or placeholder values would cause meaningless matches. */
function isCheckableValue(value) {
  if (!value || value.length < 12) return false;
  return !/^(replace-with|your-|example|test-|placeholder|changeme)/i.test(value);
}

console.log('=== build output scan ===');

if (!existsSync(clientOutputDir)) {
  console.error(
    `ERROR: ${path.relative(repoRoot, clientOutputDir)} not found — run \`npm run build\` first.`,
  );
  process.exit(1);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

const checkedVars = SERVER_ONLY_ENV_VARS.filter((name) => isCheckableValue(process.env[name]));
const failures = [];
let scanned = 0;

for (const file of walk(clientOutputDir)) {
  if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  if (statSync(file).size > 5_000_000) continue;

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  scanned++;
  const relative = path.relative(repoRoot, file).split(path.sep).join('/');

  for (const finding of findSecrets(text, SECRET_PATTERNS)) {
    failures.push(`possible ${finding.name} in client bundle ${relative}:${finding.line}`);
  }

  for (const name of checkedVars) {
    if (text.includes(process.env[name])) {
      failures.push(`value of server-only env var ${name} appears in client bundle ${relative}`);
    }
  }
}

console.log(
  `Scanned ${scanned} client asset(s). Server-only env vars with checkable values in this environment: ${checkedVars.length}.`,
);
if (checkedVars.length === 0) {
  console.log(
    'NOTE: no server-only env vars are set here, so only pattern-based checks ran. This is expected in CI, which builds without real credentials.',
  );
}

if (failures.length === 0) {
  console.log('PASS: no secrets or server-only values found in client build output.');
  process.exit(0);
}

for (const failure of failures) console.error(`ERROR: ${failure} (value not printed)`);
console.error(`\nFAIL: ${failures.length} issue(s) in build output.`);
process.exit(1);
