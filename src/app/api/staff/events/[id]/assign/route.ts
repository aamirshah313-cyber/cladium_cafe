/** POST /api/staff/events/[id]/assign — Runbook Step 24. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { parseStaffMutatingRequest } from '../../../../../../lib/http/staff-mutating-route';
import { staffDirectory } from '../../../../../../modules/staff/deps';
import { staffAssignBodySchema } from '../../../../../../modules/staff/schemas';
import { eventDeps } from '../../../../../../modules/events/deps';
import { assignEventRequest } from '../../../../../../modules/events/staff-service';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = await parseStaffMutatingRequest(request, staffAssignBodySchema, staffDirectory);
  if (!parsed.ok) return respondResult(parsed);

  const { id } = await context.params;
  const result = await assignEventRequest(eventDeps, parsed.value.actor, {
    entityId: id,
    expectedVersion: parsed.value.body.expectedVersion,
    assignedStaffId: parsed.value.body.assignedStaffId,
    correlationId: parsed.value.correlationId,
  });
  return respondResult(result);
}
