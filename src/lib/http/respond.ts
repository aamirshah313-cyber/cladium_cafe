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
  /** A single cookie, or several (e.g. Step 45's "issue the real staff session, clear the pending-MFA one" case) — each is appended as its own `Set-Cookie` header, never merged into one. */
  readonly setCookieHeader?: string | readonly string[] | null;
  readonly status?: number;
}

export function respondResult<T>(
  result: Result<T, AppError>,
  options: RespondOptions = {},
): NextResponse {
  const response = result.ok
    ? NextResponse.json(result.value, { status: options.status ?? 200 })
    : NextResponse.json({ error: toPublicError(result.error) }, { status: result.error.status });

  const cookies = options.setCookieHeader;
  if (cookies) {
    for (const cookie of Array.isArray(cookies) ? cookies : [cookies]) {
      response.headers.append('Set-Cookie', cookie);
    }
  }
  return response;
}
