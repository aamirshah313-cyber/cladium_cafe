/** POST /api/staff/menu/import — imports the current menu.json as a new DRAFT version, or no-ops if already imported. OWNER/MANAGER only. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../lib/http/respond';
import { parseStaffMutatingRequest } from '../../../../../lib/http/staff-mutating-route';
import { staffDirectory } from '../../../../../modules/staff/deps';
import { menuImportBodySchema } from '../../../../../modules/staff/schemas';
import { createMenuAdminDeps } from '../../../../../modules/menu/deps';
import { importMenuDraft } from '../../../../../modules/menu/admin-service';

export async function POST(request: NextRequest) {
  const parsed = await parseStaffMutatingRequest(request, menuImportBodySchema, staffDirectory);
  if (!parsed.ok) return respondResult(parsed);

  const result = await importMenuDraft(
    createMenuAdminDeps(),
    parsed.value.actor,
    parsed.value.correlationId,
  );
  return respondResult(result);
}
