/**
 * Result-to-NextResponse mapping — Runbook Step 20.
 *
 * The one place an `AppError` becomes an HTTP response, so every route
 * handler maps errors identically: `toPublicError` (errors.ts) already
 * strips `internalMessage`, this only adds the HTTP status and, when a
 * session cookie needs setting, the `Set-Cookie` header.
 */

import { NextResponse } from 'next/server';
import { toPublicError, type AppError } from '../errors';
import type { Result } from '../result';

export interface RespondOptions {
  readonly setCookieHeader?: string | null;
  readonly status?: number;
}

export function respondResult<T>(
  result: Result<T, AppError>,
  options: RespondOptions = {},
): NextResponse {
  const response = result.ok
    ? NextResponse.json(result.value, { status: options.status ?? 200 })
    : NextResponse.json({ error: toPublicError(result.error) }, { status: result.error.status });

  if (options.setCookieHeader) {
    response.headers.append('Set-Cookie', options.setCookieHeader);
  }
  return response;
}
