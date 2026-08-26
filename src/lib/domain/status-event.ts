/**
 * Append-only state-transition history — Runbook Step 19 (data-model-v2.md
 * `status_events`).
 *
 * Written every time a request's state changes — creation included, where
 * `previousState` is `null`. `buildStatusEvent` is pure; a caller supplies
 * `now` only to keep tests deterministic, defaulting to the real clock.
 */

import type { Actor } from './actor';

export type EntityType =
  'TAKEAWAY_REQUEST' | 'BOOKING_REQUEST' | 'EVENT_REQUEST' | 'MENU_VERSION' | 'FEATURE_FLAG';

export interface StatusEvent {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly previousState: string | null;
  readonly newState: string;
  readonly actorType: Actor['type'];
  readonly actorId: string | null;
  readonly reasonCode: string | null;
  readonly reasonNote: string | null;
  readonly requestVersion: number;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface BuildStatusEventInput {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly previousState: string | null;
  readonly newState: string;
  readonly actor: Actor;
  readonly reasonCode?: string | null;
  readonly reasonNote?: string | null;
  readonly requestVersion: number;
  readonly correlationId: string;
  readonly now?: () => Date;
}

export function buildStatusEvent(input: BuildStatusEventInput): StatusEvent {
  const now = input.now ?? (() => new Date());
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    previousState: input.previousState,
    newState: input.newState,
    actorType: input.actor.type,
    actorId: input.actor.id,
    reasonCode: input.reasonCode ?? null,
    reasonNote: input.reasonNote ?? null,
    requestVersion: input.requestVersion,
    correlationId: input.correlationId,
    occurredAt: now().toISOString(),
  };
}
