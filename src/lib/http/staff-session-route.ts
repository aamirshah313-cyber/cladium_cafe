/**
 * Staff session/CSRF/origin resolution for protected staff API routes —
 * Runbook Step 24. Mirrors `session-route.ts`'s shape for guests, with one
 * deliberate difference: `resolveStaffActor` never mints a session — a
 * missing or invalid staff cookie is `UNAUTHORIZED`, not "start a new
 * anonymous one." Fails *closed* on missing `SESSION_SECRET`/
 * `NEXT_PUBLIC_APP_URL`, same reasoning as the guest guard.
 */

import { parseAppUrl } from '../env';
import { parseSessionSecret } from '../env.server';
import { assertServerOnly } from '../server-only';
import { err, ok, type Result } from '../result';
import { forbidden, internalError, unauthorized, type AppError } from '../errors';
import type { Actor } from '../domain/actor';
import { readStaffSessionToken, resolveStaffSession } from '../staff-session';
import { createCsrfToken, guardMutation, isMutatingMethod } from '../security/csrf';
import { trustedOriginConfig } from '../security/origin';
import type { StaffDirectory } from '../../modules/staff/directory';

assertServerOnly('src/lib/http/staff-session-route.ts');

type HeaderSource = Headers | Record<string, string | string[] | undefined>;

export interface StaffRouteContext {
  readonly actor: Actor;
  readonly staffId: string;
  readonly displayName: string;
  readonly csrfToken: string;
}

export interface ResolveStaffActorInput {
  readonly headers: HeaderSource;
  readonly secure: boolean;
  readonly directory: StaffDirectory;
  readonly correlationId?: string;
  readonly now?: Date;
}

/** `UNAUTHORIZED` for a missing/invalid/expired token, or a token for an account that no longer exists (removed since it was issued). */
export async function resolveStaffActor(
  input: ResolveStaffActorInput,
): Promise<Result<StaffRouteContext, AppError>> {
  let secret: string;
  try {
    secret = parseSessionSecret();
  } catch {
    return err(internalError('SESSION_SECRET not configured', input.correlationId));
  }

  const token = readStaffSessionToken(input.headers, { secure: input.secure });
  const resolved = resolveStaffSession(token, secret, { now: input.now });
  if (!resolved) return err(unauthorized(input.correlationId));

  const account = await input.directory.findAccount(resolved.staffId);
  if (!account) return err(unauthorized(input.correlationId));

  return ok({
    actor: { type: 'STAFF', id: account.staffId, roles: account.roles },
    staffId: account.staffId,
    displayName: account.displayName,
    csrfToken: createCsrfToken(account.staffId, secret),
  });
}

export interface GuardStaffMutationInput {
  readonly method: string;
  readonly origin?: string | null;
  readonly referer?: string | null;
  readonly staffId: string;
  readonly csrfToken?: string | null;
  readonly correlationId?: string;
}

/** No-op for a non-mutating method (GET/HEAD/OPTIONS). */
export function guardStaffMutation(input: GuardStaffMutationInput): Result<void, AppError> {
  if (!isMutatingMethod(input.method)) return ok(undefined);

  let secret: string;
  try {
    secret = parseSessionSecret();
  } catch {
    return err(internalError('SESSION_SECRET not configured', input.correlationId));
  }

  let appOrigin: string;
  try {
    appOrigin = new URL(parseAppUrl()).origin;
  } catch {
    return err(forbidden(input.correlationId));
  }

  const result = guardMutation(
    {
      method: input.method,
      origin: input.origin,
      referer: input.referer,
      sessionId: input.staffId,
      csrfToken: input.csrfToken,
      secret,
    },
    trustedOriginConfig([appOrigin]),
  );

  return result.ok ? ok(undefined) : err(forbidden(input.correlationId));
}
