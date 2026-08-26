/** POST /api/staff/takeaway/[id]/assign — Runbook Step 24. Assignment is metadata, not a state change; see `performStaffAssignment`. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { parseStaffMutatingRequest } from '../../../../../../lib/http/staff-mutating-route';
import { staffDirectory } from '../../../../../../modules/staff/deps';
import { staffAssignBodySchema } from '../../../../../../modules/staff/schemas';
import { takeawayDeps } from '../../../../../../modules/takeaway/deps';
import { assignTakeawayRequest } from '../../../../../../modules/takeaway/staff-service';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = await parseStaffMutatingRequest(request, staffAssignBodySchema, staffDirectory);
  if (!parsed.ok) return respondResult(parsed);

  const { id } = await context.params;
  const result = await assignTakeawayRequest(takeawayDeps, parsed.value.actor, {
    entityId: id,
    expectedVersion: parsed.value.body.expectedVersion,
    assignedStaffId: parsed.value.body.assignedStaffId,
    correlationId: parsed.value.correlationId,
  });
  return respondResult(result);
}
