/** POST /api/staff/bookings/[id]/assign — Runbook Step 24. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { parseStaffMutatingRequest } from '../../../../../../lib/http/staff-mutating-route';
import { staffDirectory } from '../../../../../../modules/staff/deps';
import { staffAssignBodySchema } from '../../../../../../modules/staff/schemas';
import { bookingDeps } from '../../../../../../modules/bookings/deps';
import { assignBookingRequest } from '../../../../../../modules/bookings/staff-service';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = await parseStaffMutatingRequest(request, staffAssignBodySchema, staffDirectory);
  if (!parsed.ok) return respondResult(parsed);

  const { id } = await context.params;
  const result = await assignBookingRequest(bookingDeps, parsed.value.actor, {
    entityId: id,
    expectedVersion: parsed.value.body.expectedVersion,
    assignedStaffId: parsed.value.body.assignedStaffId,
    correlationId: parsed.value.correlationId,
  });
  return respondResult(result);
}
