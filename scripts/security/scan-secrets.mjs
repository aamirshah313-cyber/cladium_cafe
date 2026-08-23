#!/usr/bin/env node
// Read-only secret scanner. Walks the working tree, reports likely secrets,
// and exits non-zero if any are found. It never prints a matched value —
// only the file, line number, and pattern name — so CI logs stay safe.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SECRET_PATTERNS,
  IGNORED_PATH_SEGMENTS,
  BINARY_EXTENSIONS,
  findSecrets,
} from './patterns.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

/** Env files that must never exist in the repo (only .env.example is allowed). */
const DISALLOWED_ENV_FILES = /^\.env(\..+)?$/;
const ALLOWED_ENV_FILE = '.env.example';

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_PATH_SEGMENTS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const findings = [];
const envFileViolations = [];

for (const file of walk(repoRoot)) {
  const relative = path.relative(repoRoot, file).split(path.sep).join('/');
  const basename = path.basename(file);

  // A real .env committed alongside the placeholder example is a hard failure
  // regardless of its contents.
  if (DISALLOWED_ENV_FILES.test(basename) && basename !== ALLOWED_ENV_FILE) {
    envFileViolations.push(relative);
    continue;
  }

  if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  // Lockfiles contain long integrity hashes that are not secrets.
  if (basename === 'package-lock.json') continue;

  let size;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size > 2_000_000) continue;

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const finding of findSecrets(text, SECRET_PATTERNS)) {
    findings.push({ file: relative, ...finding });
  }
}

console.log('=== secret scan ===');
console.log(`Patterns: ${SECRET_PATTERNS.length}. Scanning working tree from ${repoRoot}`);

for (const violation of envFileViolations) {
  console.error(
    `ERROR: disallowed environment file present: ${violation} (only ${ALLOWED_ENV_FILE} may exist)`,
  );
}

for (const f of findings) {
  console.error(`ERROR: possible ${f.name} in ${f.file}:${f.line} (value not printed)`);
}

// .env.example must stay placeholders-only — verify it exists and is not
// silently replaced by something with real-looking values.
const examplePath = path.join(repoRoot, ALLOWED_ENV_FILE);
if (!existsSync(examplePath)) {
  console.error(
    `ERROR: ${ALLOWED_ENV_FILE} is missing — the placeholder inventory must be present.`,
  );
  process.exit(1);
}

const total = findings.length + envFileViolations.length;
if (total === 0) {
  console.log('PASS: no secrets, tokens, private keys, or disallowed .env files detected.');
  process.exit(0);
}

console.error(
  `\nFAIL: ${total} issue(s) found. Never commit real credentials; rotate anything exposed.`,
);
process.exit(1);
