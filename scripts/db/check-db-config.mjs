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
import {
  checkFilenames,
  checkMoneyColumns,
  checkNoUnacknowledgedDestructiveDdl,
  checkRowLevelSecurity,
  checkTimestampColumns,
} from './migration-invariants.mjs';

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
let migrationCount = 0;
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
if (!existsSync(migrationsDir)) {
  errors.push('supabase/migrations/ is missing.');
} else {
  const { readdirSync } = await import('node:fs');
  const filenames = readdirSync(migrationsDir).sort();
  const { errors: nameErrors, migrations } = checkFilenames(filenames);
  errors.push(...nameErrors);

  const files = migrations.map((name) => ({
    name,
    sql: readFileSync(path.join(migrationsDir, name), 'utf8'),
  }));
  const combined = files.map((f) => f.sql).join('\n');

  const { errors: rlsErrors, created } = checkRowLevelSecurity(combined);
  errors.push(...rlsErrors);
  errors.push(...checkNoUnacknowledgedDestructiveDdl(files));
  errors.push(...checkMoneyColumns(combined));
  errors.push(...checkTimestampColumns(combined));

  migrationCount = migrations.length;
  notes.push(
    `supabase/migrations/: ${migrations.length} migration(s), ${created.length} table(s) created, all with RLS enabled.`,
  );
}

// --- generated types --------------------------------------------------------
// Types must be committed alongside the migration that changed the schema, so
// the two cannot drift. Before the first migration their absence is correct.
const typesPath = path.join(repoRoot, 'src', 'lib', 'db', 'database.types.ts');
if (existsSync(typesPath)) {
  notes.push(
    'Generated types present — regenerate with `npm run db:types` whenever a migration changes the schema.',
  );
} else if (migrationCount > 0) {
  errors.push(
    'src/lib/db/database.types.ts is missing while migrations exist. Run `npm run db:types` and commit it with the migration.',
  );
} else {
  notes.push('Generated types absent, which is correct while no migration exists.');
}

// --- report -----------------------------------------------------------------
for (const note of notes) console.log(`INFO:  ${note}`);
for (const error of errors) console.error(`ERROR: ${error}`);

if (errors.length === 0) {
  console.log('PASS: connection routing, pooling, and environment separation invariants hold.');
  process.exit(0);
}
console.error(`\nFAIL: ${errors.length} configuration issue(s).`);
process.exit(1);
