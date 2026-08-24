// Offline tests for the migration linter. No Docker, no database.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkFilenames,
  checkMoneyColumns,
  checkNoUnacknowledgedDestructiveDdl,
  checkRowLevelSecurity,
  checkTimestampColumns,
} from './migration-invariants.mjs';

test('accepts well-formed migration filenames in order, ignoring .gitkeep', () => {
  const { errors, migrations } = checkFilenames([
    '.gitkeep',
    '20260824120001_foundations.sql',
    '20260824120002_business_configuration.sql',
  ]);
  assert.deepEqual(errors, []);
  assert.equal(migrations.length, 2);
});

test('rejects a filename the CLI would silently ignore', () => {
  const { errors } = checkFilenames(['add_tables.sql']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not a valid migration filename/);
});

test('rejects duplicate timestamps, which make ordering ambiguous', () => {
  const { errors } = checkFilenames(['20260824120001_a.sql', '20260824120001_b.sql']);
  assert.ok(errors.some((e) => /Duplicate migration timestamp/.test(e)));
});

test('flags a created table with no row level security', () => {
  const sql = 'create table orders (id uuid primary key);';
  const { errors } = checkRowLevelSecurity(sql);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /orders/);
});

test('accepts a created table that enables row level security', () => {
  const sql = `
    create table orders (id uuid primary key);
    alter table orders enable row level security;
  `;
  assert.deepEqual(checkRowLevelSecurity(sql).errors, []);
});

test('handles schema-qualified table names', () => {
  const sql = `
    create table public.orders (id uuid primary key);
    alter table public.orders enable row level security;
  `;
  assert.deepEqual(checkRowLevelSecurity(sql).errors, []);
});

test('blocks unacknowledged destructive DDL', () => {
  const errors = checkNoUnacknowledgedDestructiveDdl([
    { name: '20260824120005_oops.sql', sql: 'drop table menu_items;' },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /expand\/migrate\/contract/);
});

test('allows destructive DDL that is explicitly acknowledged', () => {
  const errors = checkNoUnacknowledgedDestructiveDdl([
    {
      name: '20260824120006_contract.sql',
      sql: '-- allow-destructive: contract phase, column already unused\ndrop column legacy_price;',
    },
  ]);
  assert.deepEqual(errors, []);
});

test('rejects a money column that is not an integer type', () => {
  const errors = checkMoneyColumns('create table t (\n  price_pkr numeric(10,2) not null\n);');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /price_pkr/);
});

test('accepts integer money columns', () => {
  const sql = `create table t (
    price_pkr integer not null,
    fixed_amount_pkr integer,
    total_pkr bigint
  );`;
  assert.deepEqual(checkMoneyColumns(sql), []);
});

test('rejects a naive timestamp column', () => {
  const errors = checkTimestampColumns('create table t (\n  created_at timestamp not null\n);');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /timestamptz/);
});

test('accepts timestamptz columns', () => {
  assert.deepEqual(
    checkTimestampColumns('create table t (\n  created_at timestamptz not null default now()\n);'),
    [],
  );
});
