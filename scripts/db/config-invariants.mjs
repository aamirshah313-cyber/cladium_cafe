// Pure invariant checks for the database configuration.
//
// These enforce the connection-routing rules from
// production-architecture-v2.md §13 and deployment-target.md:
//   - application traffic goes through the transaction pooler (port 6543)
//   - migrations use a separate direct/session connection (port 5432)
//   - both require SSL
//   - no privileged variable is exposed as NEXT_PUBLIC_*
//
// Every function is pure so it can be unit-tested without Docker, the
// Supabase CLI, or any network access.

export const POOLER_PORT = '6543';
export const DIRECT_PORT = '5432';

/** Privileged variables that must never be client-exposed. */
export const PRIVILEGED_VARS = [
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
  'CRON_SECRET',
  'ANTHROPIC_API_KEY',
  'VAPI_PRIVATE_KEY',
  'VAPI_WEBHOOK_HMAC_SECRET',
];

/** Minimal dotenv parser: `KEY=value`, ignoring blanks and `#` comments. */
export function parseEnvFile(text) {
  const entries = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    entries[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return entries;
}

/** Returns the port in a postgres URL, or null when absent/unparseable. */
export function portOf(connectionString) {
  const match = /:(\d{2,5})\//.exec(connectionString ?? '');
  return match ? match[1] : null;
}

export function checkConnectionStrings(env) {
  const errors = [];
  const appUrl = env.DATABASE_URL;
  const migrationUrl = env.DIRECT_DATABASE_URL;

  if (!appUrl) errors.push('DATABASE_URL is missing.');
  if (!migrationUrl) errors.push('DIRECT_DATABASE_URL is missing.');
  if (!appUrl || !migrationUrl) return errors;

  if (portOf(appUrl) !== POOLER_PORT) {
    errors.push(
      `DATABASE_URL must use the transaction pooler port ${POOLER_PORT} (found ${portOf(appUrl) ?? 'none'}). Serverless request traffic goes through the pooler.`,
    );
  }
  if (portOf(migrationUrl) !== DIRECT_PORT) {
    errors.push(
      `DIRECT_DATABASE_URL must use the direct port ${DIRECT_PORT} (found ${portOf(migrationUrl) ?? 'none'}). Migrations cannot run through a transaction pooler.`,
    );
  }
  if (appUrl === migrationUrl) {
    errors.push(
      'DATABASE_URL and DIRECT_DATABASE_URL must be different connections — the whole point is separating pooled request traffic from migration access.',
    );
  }
  for (const [name, value] of [
    ['DATABASE_URL', appUrl],
    ['DIRECT_DATABASE_URL', migrationUrl],
  ]) {
    if (!value.includes('sslmode=require')) {
      errors.push(`${name} must include sslmode=require.`);
    }
    if (!value.startsWith('postgres://') && !value.startsWith('postgresql://')) {
      errors.push(`${name} must be a postgres connection URL.`);
    }
  }
  return errors;
}

/** No privileged variable may appear under a NEXT_PUBLIC_ name. */
export function checkNoPrivilegedPublicVars(env) {
  const errors = [];
  for (const key of Object.keys(env)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    const suffix = key.slice('NEXT_PUBLIC_'.length);
    if (
      PRIVILEGED_VARS.includes(suffix) ||
      /SECRET|PRIVATE|SERVICE_ROLE|TOKEN|PASSWORD/.test(suffix)
    ) {
      errors.push(`${key} exposes a privileged value to the browser.`);
    }
  }
  return errors;
}

/** Structural checks on supabase/config.toml — no TOML dependency needed. */
export function checkSupabaseConfig(text) {
  const errors = [];
  const requires = [
    { pattern: /^\s*\[db\.pooler\]/m, message: 'config.toml is missing the [db.pooler] section.' },
    {
      pattern: /pool_mode\s*=\s*"transaction"/,
      message: 'config.toml must set pool_mode = "transaction" for application traffic.',
    },
    { pattern: /^\s*\[api\]/m, message: 'config.toml is missing the [api] section.' },
    { pattern: /^\s*\[auth\]/m, message: 'config.toml is missing the [auth] section.' },
    {
      pattern: /enable_signup\s*=\s*false/,
      message:
        'config.toml must disable self-signup: staff accounts are provisioned, and guests never become Auth users.',
    },
    {
      pattern: /project_id\s*=\s*"[^"]+"/,
      message: 'config.toml must declare a project_id.',
    },
  ];
  for (const { pattern, message } of requires) {
    if (!pattern.test(text)) errors.push(message);
  }
  return errors;
}

/** The example file must stay placeholders-only. */
export function checkPlaceholdersOnly(env) {
  const errors = [];
  const realish = /supabase\.co|amazonaws\.com|\.pooler\./;
  for (const name of ['DATABASE_URL', 'DIRECT_DATABASE_URL']) {
    const value = env[name] ?? '';
    if (realish.test(value)) {
      errors.push(`${name} in .env.example looks like a real host. Keep placeholders only.`);
    }
  }
  return errors;
}
