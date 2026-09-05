/** POST /api/staff/menu/[versionNumber]/publish — OWNER/MANAGER only. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { parseStaffMutatingRequest } from '../../../../../../lib/http/staff-mutating-route';
import { err } from '../../../../../../lib/result';
import { validationFailed } from '../../../../../../lib/errors';
import { staffDirectory } from '../../../../../../modules/staff/deps';
import { menuPublishBodySchema } from '../../../../../../modules/staff/schemas';
import { createMenuAdminDeps } from '../../../../../../modules/menu/deps';
import { publishMenuVersion } from '../../../../../../modules/menu/admin-service';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ versionNumber: string }> },
) {
  const parsed = await parseStaffMutatingRequest(request, menuPublishBodySchema, staffDirectory);
  if (!parsed.ok) return respondResult(parsed);

  const { versionNumber: rawVersionNumber } = await context.params;
  const versionNumber = Number(rawVersionNumber);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return respondResult(
      err(
        validationFailed([{ path: 'versionNumber', code: 'invalid' }], parsed.value.correlationId),
      ),
    );
  }

  const result = await publishMenuVersion(
    createMenuAdminDeps(),
    parsed.value.actor,
    versionNumber,
    parsed.value.correlationId,
  );
  return respondResult(result);
}
