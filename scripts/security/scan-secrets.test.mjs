// Built-in Node test runner (node:test) — zero application dependencies.
// Run with: node --test "scripts/security/**/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findSecrets, SECRET_PATTERNS } from './patterns.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// Synthetic, non-functional fixtures assembled at runtime so this test file
// contains no literal secret-shaped string of its own.
const fake = (...parts) => parts.join('');

test('detects an Anthropic-style API key', () => {
  const text = `const key = "${fake('sk-', 'ant-', 'api03-', 'A'.repeat(24))}";`;
  const found = findSecrets(text);
  assert.equal(found.length >= 1, true);
  assert.equal(found[0].name, 'Anthropic API key');
});

test('detects an AWS access key id and reports its line number', () => {
  const text = ['first line', `AWS_KEY=${fake('AKIA', 'ABCDEFGHIJKLMNOP')}`].join('\n');
  const found = findSecrets(text);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
});

test('detects a private key block', () => {
  const text = fake('-----BEGIN ', 'RSA ', 'PRIVATE KEY-----');
  assert.equal(findSecrets(text).length, 1);
});

test('detects a JWT', () => {
  const text = fake('eyJ', 'abcdefghij', '.', 'klmnopqrst', '.', 'uvwxyz1234');
  assert.equal(findSecrets(text).length >= 1, true);
});

test('does not flag placeholder values used in .env.example', () => {
  const text = [
    'ANTHROPIC_API_KEY=replace-with-development-anthropic-key',
    'SESSION_SECRET=replace-with-at-least-32-random-bytes',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-development-publishable-key',
  ].join('\n');
  assert.deepEqual(findSecrets(text), []);
});

test('does not flag ordinary prose or code', () => {
  const text = [
    'The concierge must never invent prices.',
    'const total = subtotal + adjustments;',
    'password: process.env.DB_PASSWORD,',
  ].join('\n');
  assert.deepEqual(findSecrets(text), []);
});

test('the checked-in .env.example contains no detectable secrets', () => {
  const text = readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
  assert.deepEqual(findSecrets(text), []);
});

test('the pattern module does not match its own source (no self-flagging)', () => {
  const text = readFileSync(path.join(__dirname, 'patterns.mjs'), 'utf8');
  assert.deepEqual(findSecrets(text), []);
});

test('every pattern has a name and a RegExp', () => {
  for (const pattern of SECRET_PATTERNS) {
    assert.equal(typeof pattern.name, 'string');
    assert.equal(pattern.re instanceof RegExp, true);
  }
});
