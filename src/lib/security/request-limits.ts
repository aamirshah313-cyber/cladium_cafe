/**
 * Request Content-Type and body-size enforcement.
 *
 * Runs before any body parsing, so an oversized or wrong-type payload is
 * rejected with a safe, generic `AppError` instead of reaching a JSON
 * parser or a schema. `checkContentLength` is a fast pre-check against the
 * declared header only; `checkBodySize` re-checks the decoded body itself,
 * because a caller must not trust a declared `Content-Length` (it can be
 * absent under chunked transfer, or simply wrong).
 */

import { assertServerOnly } from '../server-only';
import { payloadTooLarge, unsupportedMediaType, type AppError } from '../errors';
import { err, ok, type Result } from '../result';

assertServerOnly('src/lib/security/request-limits.ts');

/** 32 KiB is generous for a JSON request/booking/event body and is never a file upload — those are out of scope. */
export const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

export function checkContentType(
  contentTypeHeader: string | null | undefined,
  allowed: readonly string[] = ['application/json'],
  correlationId?: string,
): Result<void, AppError> {
  const mediaType = contentTypeHeader?.split(';')[0]?.trim().toLowerCase();
  if (!mediaType || !allowed.includes(mediaType)) {
    return err(unsupportedMediaType(correlationId));
  }
  return ok(undefined);
}

export function checkContentLength(
  contentLengthHeader: string | null | undefined,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
  correlationId?: string,
): Result<void, AppError> {
  if (contentLengthHeader === null || contentLengthHeader === undefined) {
    // Absent under chunked transfer encoding — `checkBodySize` covers that case instead.
    return ok(undefined);
  }
  const length = Number(contentLengthHeader);
  if (!Number.isFinite(length) || length < 0) {
    return err(payloadTooLarge(correlationId));
  }
  if (length > maxBytes) {
    return err(payloadTooLarge(correlationId));
  }
  return ok(undefined);
}

/** Enforces the limit against the actual decoded body, for callers that must not trust `Content-Length` alone. */
export function checkBodySize(
  body: string,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
  correlationId?: string,
): Result<void, AppError> {
  if (Buffer.byteLength(body, 'utf8') > maxBytes) {
    return err(payloadTooLarge(correlationId));
  }
  return ok(undefined);
}
