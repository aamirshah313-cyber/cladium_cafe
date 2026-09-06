/**
 * POST /api/staff/notifications/[id]/read — marks one notification read.
 *
 * Exists because read state only became meaningful once notifications
 * became durable: while the store was a per-process `Map`, marking
 * something read was forgotten on the next instance, so there was nothing
 * worth exposing. Now that it persists, staff need a way to set it.
 *
 * Same authorization as `GET /api/staff/notifications`: any signed-in staff
 * member, resolved through `resolveStaffActor`, because a new request is
 * relevant across roles rather than entity-scoped. An unauthenticated or
 * non-staff caller is rejected by that resolver before this handler does
 * anything, and guests have no route to it at all.
 *
 * The write itself goes through the service-role store, so `authenticated`
 * needs no table-write grant — the same worker-owned posture
 * `outbox_events` uses. Marking an id that does not exist is a no-op, not
 * an error, matching the store contract; nothing here reveals whether a
 * given id exists.
 */

import type { NextRequest } from 'next/server';
import { respondResult } from '../../../../../../lib/http/respond';
import { resolveStaffActor } from '../../../../../../lib/http/staff-session-route';
import { correlationIdFrom } from '../../../../../../lib/correlation';
import { ok } from '../../../../../../lib/result';
import { staffDirectory, staffNotifications } from '../../../../../../modules/staff/deps';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actorResult = await resolveStaffActor({
    headers: request.headers,
    secure: request.nextUrl.protocol === 'https:',
    directory: staffDirectory,
    correlationId: correlationIdFrom(request.headers),
  });
  if (!actorResult.ok) return respondResult(actorResult);

  const { id } = await context.params;
  await staffNotifications.markRead(id, new Date());
  return respondResult(ok({ id, read: true }));
}
