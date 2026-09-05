/** GET /api/staff/menu/[versionNumber] — full detail, diff against published, and category photos. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../lib/http/respond';
import { resolveStaffActor } from '../../../../../lib/http/staff-session-route';
import { correlationIdFrom } from '../../../../../lib/correlation';
import { err } from '../../../../../lib/result';
import { validationFailed } from '../../../../../lib/errors';
import { staffDirectory } from '../../../../../modules/staff/deps';
import { createMenuAdminDeps } from '../../../../../modules/menu/deps';
import { getMenuVersionDetail } from '../../../../../modules/menu/admin-service';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ versionNumber: string }> },
) {
  const correlationId = correlationIdFrom(request.headers);
  const actorResult = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId,
  });
  if (!actorResult.ok) return respondResult(actorResult);

  const { versionNumber: rawVersionNumber } = await context.params;
  const versionNumber = Number(rawVersionNumber);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return respondResult(
      err(validationFailed([{ path: 'versionNumber', code: 'invalid' }], correlationId)),
    );
  }

  const result = await getMenuVersionDetail(createMenuAdminDeps(), versionNumber, correlationId);
  return respondResult(result);
}
