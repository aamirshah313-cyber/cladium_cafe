/**
 * Append-only audit trail — Runbook Step 19 (data-model-v2.md `audit_events`).
 *
 * Broader than `status-event.ts`: authentication-sensitive and
 * administrative activity, menu publishing, feature changes, exports, and
 * PII access — not only request state transitions. `safeDetail` must
 * already be redacted/minimized by the caller (`lib/redaction.ts`) before
 * it reaches this builder; this module does not redact anything itself.
 */

import type { Actor } from './actor';

export type AuditEventCategory =
  'AUTH' | 'ADMIN' | 'MENU_PUBLISHING' | 'FEATURE_CHANGE' | 'EXPORT' | 'PII_ACCESS';

export interface AuditEvent {
  readonly category: AuditEventCategory;
  /** Short, developer-authored action name, e.g. "menu_version.published". */
  readonly action: string;
  readonly actorType: Actor['type'];
  readonly actorId: string | null;
  readonly targetType: string | null;
  readonly targetId: string | null;
  /** Already redacted/minimized by the caller — never raw PII or secrets. */
  readonly safeDetail: Readonly<Record<string, unknown>> | null;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface BuildAuditEventInput {
  readonly category: AuditEventCategory;
  readonly action: string;
  readonly actor: Actor;
  readonly targetType?: string | null;
  readonly targetId?: string | null;
  readonly safeDetail?: Readonly<Record<string, unknown>> | null;
  readonly correlationId: string;
  readonly now?: () => Date;
}

export function buildAuditEvent(input: BuildAuditEventInput): AuditEvent {
  const now = input.now ?? (() => new Date());
  return {
    category: input.category,
    action: input.action,
    actorType: input.actor.type,
    actorId: input.actor.id,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    safeDetail: input.safeDetail ?? null,
    correlationId: input.correlationId,
    occurredAt: now().toISOString(),
  };
}
