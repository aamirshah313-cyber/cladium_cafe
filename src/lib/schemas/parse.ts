/**
 * The trust boundary.
 *
 * Untrusted input (request bodies, query params, cookies, agent tool
 * arguments, webhook payloads) enters the application only through
 * `parseAtBoundary`. It returns a Result rather than throwing, and its error
 * carries field *paths* only — never the rejected values, which routinely
 * contain PII such as a guest's phone number.
 */

import type { z } from 'zod';
import { err, ok, type Result } from '../result';
import { validationFailed, type AppError, type FieldIssue } from '../errors';

/** Converts Zod issues into safe, value-free field issues. */
export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    code: issue.code,
  }));
}

export function parseAtBoundary<T>(
  schema: z.ZodType<T>,
  input: unknown,
  correlationId?: string,
): Result<T, AppError> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return err(validationFailed(toFieldIssues(parsed.error), correlationId));
}

/**
 * Parses a JSON request body at the boundary. Malformed JSON is a validation
 * failure, not a crash, and the raw body is never echoed back.
 */
export async function parseJsonBody<T>(
  schema: z.ZodType<T>,
  request: { json: () => Promise<unknown> },
  correlationId?: string,
): Promise<Result<T, AppError>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err(validationFailed([{ path: '(body)', code: 'invalid_json' }], correlationId));
  }
  return parseAtBoundary(schema, body, correlationId);
}
