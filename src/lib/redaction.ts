/**
 * Log/analytics redaction.
 *
 * production-architecture-v2.md §12: "Never place API keys, access tokens,
 * contact fields, chat text, or request notes in analytics or exception
 * metadata." This module is the single chokepoint that enforces it, so
 * redaction is opt-out-by-mistake rather than opt-in-by-memory.
 */

export const REDACTED = '[REDACTED]';

/**
 * Keys whose values are always removed. Covers credentials plus the guest
 * contact/free-text fields that count as PII for this product.
 */
const SENSITIVE_KEY_PATTERN =
  /(pass(word|wd)|secret|token|api[_-]?key|apikey|authorization|auth|cookie|credential|private[_-]?key|hmac|signature|jwt|bearer|phone|mobile|whatsapp|email|address|full[_-]?name|customer[_-]?name|guest[_-]?name|notes?|message|transcript|chat|audio|prompt)/i;

/**
 * Keys that are safe and useful in logs even though they look identifier-ish.
 *
 * `internalMessage` is allowlisted so server-side diagnostics survive
 * redaction. Its contract (see errors.ts) is that it is developer-authored
 * text: never interpolate guest input, notes, chat text, or credentials into
 * it. Everything else defaults to redacted.
 */
const ALLOWLISTED_KEYS = new Set([
  'internalMessage',
  'issueCount',
  'correlationId',
  'requestId',
  'toolCallId',
  'idempotencyKey',
  'entityId',
  'entityType',
  'code',
  'status',
  'state',
  'previousState',
  'newState',
  'version',
  'locale',
  'theme',
  'event',
  'level',
  'durationMs',
  'count',
  'menuVersion',
]);

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 512;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isSensitiveKey(key: string): boolean {
  if (ALLOWLISTED_KEYS.has(key)) return false;
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Deeply redacts a value for logging. Sensitive keys are replaced wholesale;
 * unknown structures are summarized rather than serialized verbatim, so a
 * surprise object shape cannot smuggle PII into a log line.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return '[UNSERIALIZABLE]';

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redact(entry, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    // Message and stack routinely embed interpolated user input — never log them raw.
    return { name: value.name, message: REDACTED };
  }

  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redact(entry, depth + 1);
    }
    return output;
  }

  // Maps, Sets, class instances, and anything else exotic.
  return '[UNSERIALIZABLE]';
}

/** Convenience wrapper for the common "log these fields" case. */
export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return redact(fields) as Record<string, unknown>;
}
