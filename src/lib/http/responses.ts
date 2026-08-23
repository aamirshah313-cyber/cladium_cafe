/**
 * Safe response helpers.
 *
 * Route handlers serialize through these so that every response carries a
 * correlation ID, no-store caching for dynamic data, and — critically — an
 * error body built from `toPublicError`, which cannot carry internal detail.
 */

import { CORRELATION_HEADER } from '../correlation';
import { toPublicError, type AppError } from '../errors';
import type { Result } from '../result';

function baseHeaders(correlationId: string | undefined, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('content-type', 'application/json; charset=utf-8');
  // Request/booking data must never be cached by a shared cache.
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  if (correlationId) headers.set(CORRELATION_HEADER, correlationId);
  return headers;
}

export function jsonOk<T>(
  data: T,
  options: { correlationId?: string; status?: number; headers?: HeadersInit } = {},
): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: options.status ?? 200,
    headers: baseHeaders(options.correlationId, options.headers),
  });
}

export function jsonError(error: AppError, options: { headers?: HeadersInit } = {}): Response {
  return new Response(JSON.stringify({ ok: false, error: toPublicError(error) }), {
    status: error.status,
    headers: baseHeaders(error.correlationId, options.headers),
  });
}

/** Serializes a domain Result directly. */
export function jsonResult<T>(
  result: Result<T, AppError>,
  options: { correlationId?: string; status?: number; headers?: HeadersInit } = {},
): Response {
  return result.ok ? jsonOk(result.value, options) : jsonError(result.error, options);
}

/**
 * Response for a server-disabled feature. Mirrors a genuine 404 so a disabled
 * capability is indistinguishable from one that does not exist — a disabled
 * feature must not advertise itself (release-gates-v2.md Gate 1).
 */
export function featureDisabledResponse(correlationId?: string): Response {
  return jsonError({
    code: 'FEATURE_DISABLED',
    message: 'That is not available.',
    status: 404,
    ...(correlationId === undefined ? {} : { correlationId }),
  });
}
