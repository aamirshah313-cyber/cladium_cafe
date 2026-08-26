/** POST /api/staff/events/[id]/transition — Runbook Step 24. `newState: 'QUOTED'` requires `quotedAmountPkr` (schema-enforced). */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { parseStaffMutatingRequest } from '../../../../../../lib/http/staff-mutating-route';
import { staffDirectory } from '../../../../../../modules/staff/deps';
import { eventTransitionBodySchema } from '../../../../../../modules/staff/schemas';
import { eventDeps } from '../../../../../../modules/events/deps';
import { transitionEventRequest } from '../../../../../../modules/events/staff-service';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = await parseStaffMutatingRequest(
    request,
    eventTransitionBodySchema,
    staffDirectory,
  );
  if (!parsed.ok) return respondResult(parsed);

  const { id } = await context.params;
  const result = await transitionEventRequest(eventDeps, parsed.value.actor, {
    entityId: id,
    expectedVersion: parsed.value.body.expectedVersion,
    newState: parsed.value.body.newState,
    quotedAmountPkr: parsed.value.body.quotedAmountPkr,
    reasonCode: parsed.value.body.reasonCode,
    reasonNote: parsed.value.body.reasonNote,
    correlationId: parsed.value.correlationId,
  });
  return respondResult(result);
}
