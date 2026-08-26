/**
 * Who performed a domain action — Runbook Step 19.
 *
 * Every state transition, status event, and audit event records an actor
 * (data-model-v2.md §6). `GUEST`/`SYSTEM` never carry roles; only `STAFF`
 * does, and only a `STAFF` actor's roles are ever checked for
 * authorization — `hasAnyRole` is `false` by construction for any other
 * actor type, so a caller cannot accidentally authorize a guest by passing
 * an empty-but-truthy roles array.
 */

import type { ActorType, StaffRole } from '../schemas/common';

export type { ActorType, StaffRole };

export interface Actor {
  readonly type: ActorType;
  /** Opaque session ID for GUEST, staff profile ID for STAFF, null for SYSTEM. */
  readonly id: string | null;
  /** Only meaningful (and only ever populated) for `type: 'STAFF'`. */
  readonly roles?: readonly StaffRole[];
}

export function hasAnyRole(actor: Actor, allowed: readonly StaffRole[]): boolean {
  if (actor.type !== 'STAFF') return false;
  return (actor.roles ?? []).some((role) => allowed.includes(role));
}
