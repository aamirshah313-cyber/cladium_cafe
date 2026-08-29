/**
 * Shared boilerplate for a mutating (`POST`/`PATCH`/`DELETE`) JSON API route
 * — Runbook Step 20.
 *
 * In spec order (request-limits before parsing, session before CSRF, since
 * CSRF verification needs the session ID): content-type/body-size check,
 * session resolution (minting a cookie if needed), an optional rate-limit
 * check (Step 40 — cheap-first, same "reject before spending effort"
 * reasoning as the content-type/body-size checks above it; keyed off the
 * session ID, so it must run after session resolution), JSON parse, schema
 * validation, then the CSRF/origin guard. `setCookieHeader` is always
 * returned, on both the success and failure path, so a route can still
 * attach a freshly minted session cookie even when the request itself is
 * rejected (e.g. a client that posts before ever calling `GET
 * /api/takeaway/cart` gets a session — and can retry with its CSRF token —
 * even though this specific call fails).
 */

import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { err, ok, type Result } from '../result';
import { rateLimited, validationFailed, type AppError } from '../errors';
import { correlationIdFrom } from '../correlation';
import { parseAtBoundary } from '../schemas/parse';
import { checkBodySize, checkContentType } from '../security/request-limits';
import type { RateLimiter, RateLimitRule } from '../security/rate-limit';
import { guardStateChangingRequest, resolveSessionContext } from './session-route';

export interface ParsedMutatingRequest<T> {
  readonly sessionId: string;
  readonly correlationId: string;
  readonly body: T;
}

export interface MutatingRequestOutcome<T> {
  readonly setCookieHeader: string | null;
  readonly result: Result<ParsedMutatingRequest<T>, AppError>;
}

/** Opt-in per-route throttle — see `lib/http/route-rate-limits.ts` for the shared limiter/rules callers should pass here. */
export interface MutatingRateLimitOptions {
  readonly limiter: RateLimiter;
  readonly rule: RateLimitRule;
  /** Distinguishes this route's limit bucket from another sharing the same session ID against the same limiter. */
  readonly keyPrefix: string;
}

export async function parseMutatingRequest<T extends { csrfToken: string }>(
  request: NextRequest,
  schema: z.ZodType<T>,
  options?: { readonly rateLimit?: MutatingRateLimitOptions },
): Promise<MutatingRequestOutcome<T>> {
  const correlationId = correlationIdFrom(request.headers);
  const fail = (
    error: AppError,
    setCookieHeader: string | null = null,
  ): MutatingRequestOutcome<T> => ({
    setCookieHeader,
    result: err(error),
  });

  const contentTypeCheck = checkContentType(
    request.headers.get('content-type'),
    undefined,
    correlationId,
  );
  if (!contentTypeCheck.ok) return fail(contentTypeCheck.error);

  const rawBody = await request.text();
  const bodySizeCheck = checkBodySize(rawBody, undefined, correlationId);
  if (!bodySizeCheck.ok) return fail(bodySizeCheck.error);

  const sessionResult = resolveSessionContext({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
  });
  if (!sessionResult.ok) return fail(sessionResult.error);
  const { sessionId, setCookieHeader } = sessionResult.value;

  if (options?.rateLimit) {
    const { limiter, rule, keyPrefix } = options.rateLimit;
    const decision = await limiter.consume(`${keyPrefix}:${sessionId}`, rule);
    if (!decision.allowed) return fail(rateLimited(correlationId), setCookieHeader);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return fail(
      validationFailed([{ path: '(body)', code: 'invalid_json' }], correlationId),
      setCookieHeader,
    );
  }

  const bodyResult = parseAtBoundary(schema, parsedJson, correlationId);
  if (!bodyResult.ok) return fail(bodyResult.error, setCookieHeader);

  const guardResult = guardStateChangingRequest({
    method: request.method,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    sessionId,
    csrfToken: bodyResult.value.csrfToken,
    correlationId,
  });
  if (!guardResult.ok) return fail(guardResult.error, setCookieHeader);

  return {
    setCookieHeader,
    result: ok({ sessionId, correlationId, body: bodyResult.value }),
  };
}
