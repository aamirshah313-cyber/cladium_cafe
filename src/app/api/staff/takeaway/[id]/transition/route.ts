/** POST /api/staff/takeaway/[id]/transition — Runbook Step 24. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { parseStaffMutatingRequest } from '../../../../../../lib/http/staff-mutating-route';
import { staffDirectory } from '../../../../../../modules/staff/deps';
import { takeawayTransitionBodySchema } from '../../../../../../modules/staff/schemas';
import { takeawayDeps } from '../../../../../../modules/takeaway/deps';
import { transitionTakeawayRequest } from '../../../../../../modules/takeaway/staff-service';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = await parseStaffMutatingRequest(
    request,
    takeawayTransitionBodySchema,
    staffDirectory,
  );
  if (!parsed.ok) return respondResult(parsed);

  const { id } = await context.params;
  const result = await transitionTakeawayRequest(takeawayDeps, parsed.value.actor, {
    entityId: id,
    expectedVersion: parsed.value.body.expectedVersion,
    newState: parsed.value.body.newState,
    reasonCode: parsed.value.body.reasonCode,
    reasonNote: parsed.value.body.reasonNote,
    correlationId: parsed.value.correlationId,
  });
  return respondResult(result);
}
