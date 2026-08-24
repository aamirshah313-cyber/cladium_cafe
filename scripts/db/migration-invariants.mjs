// Pure, offline checks over migration SQL. No Docker, no database, no network,
// so these can run in CI alongside the other gates.
//
// Enforces the rules from data-model-v2.md §1 and §9.

export const MIGRATION_FILENAME = /^\d{14}_[a-z0-9_]+\.sql$/;

/** Files allowed in supabase/migrations that are not migrations. */
export const ALLOWED_NON_MIGRATIONS = new Set(['.gitkeep']);

/** Destructive DDL needs a deliberate expand/migrate/contract release. */
const DESTRUCTIVE = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+column\b/i,
  /\bdrop\s+type\b/i,
  /\btruncate\b/i,
];

/** Opt-out marker for a reviewed destructive migration. */
const DESTRUCTIVE_ACK = /--\s*allow-destructive:/i;

export function checkFilenames(filenames) {
  const errors = [];
  const migrations = [];
  for (const name of filenames) {
    if (ALLOWED_NON_MIGRATIONS.has(name)) continue;
    if (!MIGRATION_FILENAME.test(name)) {
      errors.push(
        `${name} is not a valid migration filename. Expected <14-digit timestamp>_snake_name.sql (the CLI ignores anything else).`,
      );
      continue;
    }
    migrations.push(name);
  }

  const timestamps = migrations.map((n) => n.slice(0, 14));
  const seen = new Set();
  for (const stamp of timestamps) {
    if (seen.has(stamp))
      errors.push(`Duplicate migration timestamp ${stamp}; ordering would be ambiguous.`);
    seen.add(stamp);
  }

  const sorted = [...migrations].sort();
  if (JSON.stringify(sorted) !== JSON.stringify(migrations)) {
    errors.push('Migration files are not in ascending timestamp order.');
  }

  return { errors, migrations };
}

/** Every table created must have RLS enabled somewhere in the migration set. */
export function checkRowLevelSecurity(combinedSql) {
  const errors = [];
  const created = [
    ...combinedSql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_.]+)/gi),
  ].map((m) => m[1].replace(/^public\./, ''));
  const enabled = new Set(
    [
      ...combinedSql.matchAll(/alter\s+table\s+([a-z0-9_.]+)\s+enable\s+row\s+level\s+security/gi),
    ].map((m) => m[1].replace(/^public\./, '')),
  );
  for (const table of created) {
    if (!enabled.has(table)) {
      errors.push(`Table "${table}" is created but never has row level security enabled.`);
    }
  }
  return { errors, created, enabled: [...enabled] };
}

export function checkNoUnacknowledgedDestructiveDdl(files) {
  const errors = [];
  for (const { name, sql } of files) {
    if (DESTRUCTIVE_ACK.test(sql)) continue;
    for (const pattern of DESTRUCTIVE) {
      if (pattern.test(sql)) {
        errors.push(
          `${name} contains destructive DDL (${pattern.source}). Use an expand/migrate/contract release, and mark the reviewed migration with "-- allow-destructive: <reason>".`,
        );
        break;
      }
    }
  }
  return errors;
}

/**
 * Money must be integer PKR. Any column whose name ends in _pkr must be
 * declared integer/bigint — never numeric, real, or double precision.
 */
export function checkMoneyColumns(combinedSql) {
  const errors = [];
  for (const match of combinedSql.matchAll(/^\s*([a-z0-9_]*_pkr)\s+([a-z ]+?)[\s,(]/gim)) {
    const [, column, rawType] = match;
    const type = rawType.trim().toLowerCase();
    if (!['integer', 'int', 'bigint', 'smallint'].includes(type)) {
      errors.push(
        `Money column "${column}" is declared ${type}; money must be an integer type (no floats).`,
      );
    }
  }
  return errors;
}

/** Timestamps must be timestamptz, never bare timestamp. */
export function checkTimestampColumns(combinedSql) {
  const errors = [];
  for (const match of combinedSql.matchAll(/^\s*([a-z0-9_]+)\s+timestamp(?!tz)\b(?!\s+with)/gim)) {
    errors.push(`Column "${match[1]}" uses timestamp; use timestamptz (UTC) instead.`);
  }
  return errors;
}
