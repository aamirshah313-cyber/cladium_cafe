// Secret-detection patterns.
//
// Every pattern is assembled from fragments at runtime so this file never
// contains a literal string that matches itself — the scanner can therefore
// scan its own source without reporting a false positive.

const p = (...parts) => new RegExp(parts.join(''));

export const SECRET_PATTERNS = [
  { name: 'Anthropic API key', re: p('sk-', 'ant-', 'api\\d{2}-', '[A-Za-z0-9_-]{20,}') },
  { name: 'OpenAI-style project key', re: p('sk-', 'proj-', '[A-Za-z0-9_-]{20,}') },
  { name: 'AWS access key id', re: p('AKIA', '[0-9A-Z]{16}') },
  { name: 'GitHub personal access token', re: p('ghp_', '[A-Za-z0-9]{36}') },
  { name: 'GitHub fine-grained token', re: p('github', '_pat_', '[A-Za-z0-9_]{22,}') },
  { name: 'Slack token', re: p('xox', '[baprs]-', '[A-Za-z0-9-]{10,}') },
  { name: 'Google API key', re: p('AIza', '[0-9A-Za-z_-]{35}') },
  { name: 'Stripe secret key', re: p('sk_', 'live_', '[A-Za-z0-9]{20,}') },
  {
    name: 'Private key block',
    re: p('-----BEGIN ', '(RSA |EC |OPENSSH |PGP )?', 'PRIVATE KEY-----'),
  },
  {
    name: 'JSON Web Token',
    re: p('eyJ', '[A-Za-z0-9_-]{10,}', '\\.', '[A-Za-z0-9_-]{10,}', '\\.', '[A-Za-z0-9_-]{10,}'),
  },
  {
    name: 'Supabase service-role key (JWT form)',
    // Fragments deliberately split so this line does not match itself.
    re: p('service', '_role', '[^\\n]{0,40}', 'ey', 'J'),
  },
  {
    // A quoted, high-entropy-looking value assigned to a secret-ish name.
    // Deliberately narrow: placeholder text like "replace-with-..." and
    // obvious test fixtures do not match.
    name: 'Hardcoded credential assignment',
    re: p(
      '(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)',
      '\\s*[:=]\\s*',
      '["\\\']',
      '(?!replace-with|your-|example|test-|placeholder|changeme|xxx)',
      '[A-Za-z0-9+/_-]{16,}',
      '["\\\']',
    ),
  },
];

/** Paths never scanned: build output, dependencies, git internals, binary assets. */
export const IGNORED_PATH_SEGMENTS = [
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
];

export const BINARY_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.pdf',
  '.mp4',
  '.mov',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.zip',
]);

/**
 * Returns every pattern match in `text`. Pure and side-effect free so it can
 * be unit-tested against synthetic fixtures without touching the filesystem.
 */
export function findSecrets(text, patterns = SECRET_PATTERNS) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { name, re } of patterns) {
      if (re.test(line)) {
        findings.push({ name, line: index + 1 });
      }
    }
  });
  return findings;
}
