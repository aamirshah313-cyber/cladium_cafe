/** POST /api/staff/bookings/[id]/transition — Runbook Step 24. */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { parseStaffMutatingRequest } from '../../../../../../lib/http/staff-mutating-route';
import { staffDirectory } from '../../../../../../modules/staff/deps';
import { bookingTransitionBodySchema } from '../../../../../../modules/staff/schemas';
import { bookingDeps } from '../../../../../../modules/bookings/deps';
import { transitionBookingRequest } from '../../../../../../modules/bookings/staff-service';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const parsed = await parseStaffMutatingRequest(
    request,
    bookingTransitionBodySchema,
    staffDirectory,
  );
  if (!parsed.ok) return respondResult(parsed);

  const { id } = await context.params;
  const result = await transitionBookingRequest(bookingDeps, parsed.value.actor, {
    entityId: id,
    expectedVersion: parsed.value.body.expectedVersion,
    newState: parsed.value.body.newState,
    reasonCode: parsed.value.body.reasonCode,
    reasonNote: parsed.value.body.reasonNote,
    correlationId: parsed.value.correlationId,
  });
  return respondResult(result);
}
