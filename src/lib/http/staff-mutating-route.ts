/**
 * Shared boilerplate for an already-authenticated staff mutating API route
 * — Runbook Step 24. Mirrors `mutating-route.ts`'s shape, with the guest
 * session step replaced by `resolveStaffActor` — there is no cookie to
 * mint here; a missing/invalid staff session is `UNAUTHORIZED`, full stop.
 */

import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { err, ok, type Result } from '../result';
import { validationFailed, type AppError } from '../errors';
import { correlationIdFrom } from '../correlation';
import { parseAtBoundary } from '../schemas/parse';
import { checkBodySize, checkContentType } from '../security/request-limits';
import { guardStaffMutation, resolveStaffActor } from './staff-session-route';
import type { Actor } from '../domain/actor';
import type { StaffDirectory } from '../../modules/staff/directory';

export interface ParsedStaffMutatingRequest<T> {
  readonly actor: Actor;
  readonly staffId: string;
  readonly correlationId: string;
  readonly body: T;
}

export async function parseStaffMutatingRequest<T extends { csrfToken: string }>(
  request: NextRequest,
  schema: z.ZodType<T>,
  directory: StaffDirectory,
): Promise<Result<ParsedStaffMutatingRequest<T>, AppError>> {
  const correlationId = correlationIdFrom(request.headers);

  const contentTypeCheck = checkContentType(
    request.headers.get('content-type'),
    undefined,
    correlationId,
  );
  if (!contentTypeCheck.ok) return err(contentTypeCheck.error);

  const rawBody = await request.text();
  const bodySizeCheck = checkBodySize(rawBody, undefined, correlationId);
  if (!bodySizeCheck.ok) return err(bodySizeCheck.error);

  const actorResult = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory,
    correlationId,
  });
  if (!actorResult.ok) return err(actorResult.error);
  const { actor, staffId } = actorResult.value;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return err(validationFailed([{ path: '(body)', code: 'invalid_json' }], correlationId));
  }

  const bodyResult = parseAtBoundary(schema, parsedJson, correlationId);
  if (!bodyResult.ok) return err(bodyResult.error);

  const guardResult = guardStaffMutation({
    method: request.method,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    staffId,
    csrfToken: bodyResult.value.csrfToken,
    correlationId,
  });
  if (!guardResult.ok) return err(guardResult.error);

  return ok({ actor, staffId, correlationId, body: bodyResult.value });
}
