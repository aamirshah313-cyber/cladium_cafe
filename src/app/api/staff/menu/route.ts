/** GET /api/staff/menu — list menu versions, newest first. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../lib/http/respond';
import { resolveStaffActor } from '../../../../lib/http/staff-session-route';
import { correlationIdFrom } from '../../../../lib/correlation';
import { staffDirectory } from '../../../../modules/staff/deps';
import { createMenuAdminDeps } from '../../../../modules/menu/deps';
import { listMenuVersions } from '../../../../modules/menu/admin-service';

export async function GET(request: NextRequest) {
  const correlationId = correlationIdFrom(request.headers);
  const actorResult = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId,
  });
  if (!actorResult.ok) return respondResult(actorResult);

  const result = await listMenuVersions(createMenuAdminDeps());
  return respondResult(result);
}
