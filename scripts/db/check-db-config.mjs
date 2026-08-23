#!/usr/bin/env node
// Verifies the database configuration invariants. Read-only; needs no Docker,
// no Supabase CLI, and no network. Safe to run in CI.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseEnvFile,
  checkConnectionStrings,
  checkNoPrivilegedPublicVars,
  checkSupabaseConfig,
  checkPlaceholdersOnly,
} from './config-invariants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const errors = [];
const notes = [];

console.log('=== database configuration check ===');

// --- .env.example -----------------------------------------------------------
const envExamplePath = path.join(repoRoot, '.env.example');
if (!existsSync(envExamplePath)) {
  errors.push('.env.example is missing.');
} else {
  const env = parseEnvFile(readFileSync(envExamplePath, 'utf8'));
  errors.push(...checkConnectionStrings(env));
  errors.push(...checkNoPrivilegedPublicVars(env));
  errors.push(...checkPlaceholdersOnly(env));
  notes.push(`.env.example parsed: ${Object.keys(env).length} variables declared.`);
}

// --- supabase/config.toml ---------------------------------------------------
const configPath = path.join(repoRoot, 'supabase', 'config.toml');
if (!existsSync(configPath)) {
  errors.push('supabase/config.toml is missing.');
} else {
  errors.push(...checkSupabaseConfig(readFileSync(configPath, 'utf8')));
  notes.push('supabase/config.toml present with transaction pooling configured.');
}

// --- migrations directory ---------------------------------------------------
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
if (!existsSync(migrationsDir)) {
  errors.push('supabase/migrations/ is missing.');
} else {
  notes.push('supabase/migrations/ exists (schema itself lands in Step 8+).');
}

// --- generated types --------------------------------------------------------
const typesPath = path.join(repoRoot, 'src', 'lib', 'db', 'database.types.ts');
notes.push(
  existsSync(typesPath)
    ? 'Generated types present — regenerate with `npm run db:types` whenever a migration changes the schema.'
    : 'Generated types absent, which is correct until the first migration exists (Step 8).',
);

// --- report -----------------------------------------------------------------
for (const note of notes) console.log(`INFO:  ${note}`);
for (const error of errors) console.error(`ERROR: ${error}`);

if (errors.length === 0) {
  console.log('PASS: connection routing, pooling, and environment separation invariants hold.');
  process.exit(0);
}
console.error(`\nFAIL: ${errors.length} configuration issue(s).`);
process.exit(1);
