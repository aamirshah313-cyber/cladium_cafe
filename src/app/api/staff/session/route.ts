/**
 * GET/POST/DELETE /api/staff/session — Runbook Step 24.
 *
 * GET resolves the current staff session (if any) so the workspace UI can
 * decide sign-in-form vs. dashboard on load, mirroring
 * `/api/session/csrf`'s bootstrap role for guests. POST is the
 * development-only sign-in seam (`modules/staff/dev-credentials.ts` — never
 * production auth). DELETE clears the staff cookie unconditionally; no
 * origin/CSRF guard is needed to sign a browser out of its own session.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { checkBodySize, checkContentType } from '../../../../lib/security/request-limits';
import { checkRequestOrigin, trustedOriginConfig } from '../../../../lib/security/origin';
import { parseAppUrl } from '../../../../lib/env';
import { parseSessionSecret } from '../../../../lib/env.server';
import { correlationIdFrom } from '../../../../lib/correlation';
import { parseAtBoundary } from '../../../../lib/schemas/parse';
import { err, ok } from '../../../../lib/result';
import { forbidden, internalError, unauthorized } from '../../../../lib/errors';
import { resolveStaffActor } from '../../../../lib/http/staff-session-route';
import { issueStaffSessionCookie, clearStaffSessionCookie } from '../../../../lib/staff-session';
import { verifyDevStaffCredentials } from '../../../../modules/staff/dev-credentials';
import { staffDirectory, devAccounts } from '../../../../modules/staff/deps';
import { staffSignInBodySchema } from '../../../../modules/staff/schemas';

export async function GET(request: NextRequest) {
  const result = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId: correlationIdFrom(request.headers),
  });
  if (!result.ok) return respondResult(result);
  const { staffId, displayName, actor, csrfToken } = result.value;
  return respondResult(ok({ staffId, displayName, roles: actor.roles ?? [], csrfToken }));
}

export async function POST(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);
  const secure = request.nextUrl.protocol === 'https:';

  const contentTypeCheck = checkContentType(
    request.headers.get('content-type'),
    undefined,
    correlationId,
  );
  if (!contentTypeCheck.ok) return respondResult(err(contentTypeCheck.error));

  const rawBody = await request.text();
  const bodySizeCheck = checkBodySize(rawBody, undefined, correlationId);
  if (!bodySizeCheck.ok) return respondResult(err(bodySizeCheck.error));

  let appOrigin: string;
  try {
    appOrigin = new URL(parseAppUrl()).origin;
  } catch {
    return respondResult(err(forbidden(correlationId)));
  }
  const originResult = checkRequestOrigin(
    { origin: request.headers.get('origin'), referer: request.headers.get('referer') },
    trustedOriginConfig([appOrigin]),
  );
  if (!originResult.trusted) return respondResult(err(forbidden(correlationId)));

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return respondResult(
      err(forbidden(correlationId)), // malformed sign-in body — no need to distinguish reasons for an unauthenticated caller
    );
  }
  const bodyResult = parseAtBoundary(staffSignInBodySchema, parsedJson, correlationId);
  if (!bodyResult.ok) return respondResult(bodyResult);

  const staffId = verifyDevStaffCredentials(
    devAccounts,
    bodyResult.value.staffId,
    bodyResult.value.devPassword,
  );
  if (!staffId) return respondResult(err(unauthorized(correlationId)));

  let secret: string;
  try {
    secret = parseSessionSecret();
  } catch {
    return respondResult(err(internalError('SESSION_SECRET not configured', correlationId)));
  }

  const account = await staffDirectory.findAccount(staffId);
  if (!account) return respondResult(err(unauthorized(correlationId)));

  const setCookieHeader = issueStaffSessionCookie(staffId, secret, { secure });
  return respondResult(
    ok({ staffId: account.staffId, displayName: account.displayName, roles: account.roles }),
    { setCookieHeader },
  );
}

export async function DELETE(request: NextRequest) {
  const setCookieHeader = clearStaffSessionCookie({
    secure: request.nextUrl.protocol === 'https:',
  });
  return respondResult(ok({ signedOut: true }), { setCookieHeader });
}
