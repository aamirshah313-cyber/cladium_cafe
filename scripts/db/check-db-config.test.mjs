// Built-in Node test runner — no Docker, no Supabase CLI, no network.
// Run with: node --test "scripts/**/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DIRECT_PORT,
  POOLER_PORT,
  checkConnectionStrings,
  checkNoPrivilegedPublicVars,
  checkPlaceholdersOnly,
  checkSupabaseConfig,
  parseEnvFile,
  portOf,
} from './config-invariants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const validEnv = {
  DATABASE_URL: `postgresql://user:password@pooled-host:${POOLER_PORT}/database?sslmode=require`,
  DIRECT_DATABASE_URL: `postgresql://user:password@direct-host:${DIRECT_PORT}/database?sslmode=require`,
};

test('parseEnvFile reads key/value pairs and skips comments and blanks', () => {
  const parsed = parseEnvFile(['# comment', '', 'A=1', 'B=two=three', 'malformed'].join('\n'));
  assert.deepEqual(parsed, { A: '1', B: 'two=three' });
});

test('portOf extracts the port from a postgres URL', () => {
  assert.equal(portOf(validEnv.DATABASE_URL), POOLER_PORT);
  assert.equal(portOf('postgresql://host/db'), null);
  assert.equal(portOf(undefined), null);
});

test('a correctly split configuration passes', () => {
  assert.deepEqual(checkConnectionStrings(validEnv), []);
});

test('rejects application traffic that bypasses the transaction pooler', () => {
  const errors = checkConnectionStrings({
    ...validEnv,
    DATABASE_URL: `postgresql://user:password@host:${DIRECT_PORT}/db?sslmode=require`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /transaction pooler port 6543/);
});

test('rejects migrations pointed at the pooler', () => {
  const errors = checkConnectionStrings({
    ...validEnv,
    DIRECT_DATABASE_URL: `postgresql://user:password@host:${POOLER_PORT}/db?sslmode=require`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot run through a transaction pooler/);
});

test('rejects identical application and migration connections', () => {
  const shared = `postgresql://user:password@host:${POOLER_PORT}/db?sslmode=require`;
  const errors = checkConnectionStrings({ DATABASE_URL: shared, DIRECT_DATABASE_URL: shared });
  assert.equal(
    errors.some((e) => /must be different connections/.test(e)),
    true,
  );
});

test('requires sslmode=require on both connections', () => {
  const errors = checkConnectionStrings({
    DATABASE_URL: `postgresql://user:password@host:${POOLER_PORT}/db`,
    DIRECT_DATABASE_URL: `postgresql://user:password@host:${DIRECT_PORT}/db`,
  });
  assert.equal(errors.filter((e) => /sslmode=require/.test(e)).length, 2);
});

test('reports missing connection variables', () => {
  assert.equal(checkConnectionStrings({}).length, 2);
});

test('flags a privileged value exposed under NEXT_PUBLIC_', () => {
  const errors = checkNoPrivilegedPublicVars({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_DATABASE_URL: 'postgresql://leak',
    NEXT_PUBLIC_SESSION_SECRET: 'leak',
  });
  assert.equal(errors.length, 2);
});

test('allows legitimate public variables', () => {
  assert.deepEqual(
    checkNoPrivilegedPublicVars({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    }),
    [],
  );
});

test('flags a real-looking host in the example file', () => {
  const errors = checkPlaceholdersOnly({
    DATABASE_URL: `postgresql://u:p@db.abcdefgh.supabase.co:${POOLER_PORT}/postgres?sslmode=require`,
    DIRECT_DATABASE_URL: validEnv.DIRECT_DATABASE_URL,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /looks like a real host/);
});

test('checkSupabaseConfig requires pooling, api, auth, signup-off, and project_id', () => {
  assert.equal(checkSupabaseConfig('').length, 6);
});

// --- the checked-in files must satisfy their own invariants ------------------

test('the committed .env.example satisfies every connection invariant', () => {
  const env = parseEnvFile(readFileSync(path.join(repoRoot, '.env.example'), 'utf8'));
  assert.deepEqual(checkConnectionStrings(env), []);
  assert.deepEqual(checkNoPrivilegedPublicVars(env), []);
  assert.deepEqual(checkPlaceholdersOnly(env), []);
});

test('the committed supabase/config.toml satisfies every structural invariant', () => {
  const text = readFileSync(path.join(repoRoot, 'supabase', 'config.toml'), 'utf8');
  assert.deepEqual(checkSupabaseConfig(text), []);
});

test('the committed migrations satisfy every offline invariant', async () => {
  const { readdirSync } = await import('node:fs');
  const {
    checkFilenames,
    checkRowLevelSecurity,
    checkNoUnacknowledgedDestructiveDdl,
    checkMoneyColumns,
    checkTimestampColumns,
  } = await import('./migration-invariants.mjs');

  const dir = path.join(repoRoot, 'supabase', 'migrations');
  const { errors: nameErrors, migrations } = checkFilenames(readdirSync(dir).sort());
  assert.deepEqual(nameErrors, []);
  assert.ok(migrations.length > 0, 'Step 8 onward expects at least one migration');

  const files = migrations.map((name) => ({
    name,
    sql: readFileSync(path.join(dir, name), 'utf8'),
  }));
  const combined = files.map((f) => f.sql).join('\n');

  const { errors: rlsErrors, created } = checkRowLevelSecurity(combined);
  assert.deepEqual(rlsErrors, [], 'every created table must enable RLS');
  assert.ok(created.length >= 12, `expected the core content tables, found ${created.length}`);
  assert.deepEqual(checkNoUnacknowledgedDestructiveDdl(files), []);
  assert.deepEqual(checkMoneyColumns(combined), []);
  assert.deepEqual(checkTimestampColumns(combined), []);
});

test('generated database types are committed alongside the migrations', () => {
  const typesPath = path.join(repoRoot, 'src', 'lib', 'db', 'database.types.ts');
  assert.equal(existsSync(typesPath), true, 'run `npm run db:types` and commit the result');
  const types = readFileSync(typesPath, 'utf8');
  for (const table of [
    'menu_items',
    'menu_variants',
    'pricing_rules',
    'promotions',
    'translations',
  ]) {
    assert.ok(types.includes(table), `generated types should describe ${table}`);
  }
});
