/**
 * Shared "which tool calls are drafts, and what does a successful draft
 * look like" logic — extracted from `orchestrator.ts` in Runbook Step 33 so
 * `modules/voice/tools/execute-vapi-tool-calls.ts` (voice) can recognize the
 * exact same `prepareBookingRequest`/`prepareEventRequest` results text
 * chat's orchestrator does, rather than a second, possibly-drifting copy of
 * this rule. Both callers depend on this module now; neither defines its
 * own version.
 */

export type PendingConfirmationKind = 'BOOKING' | 'EVENT';

export interface PendingConfirmation {
  readonly kind: PendingConfirmationKind;
  readonly review: unknown;
  readonly confirmationToken: string;
}

export const PREPARE_TOOL_KIND: Readonly<Record<string, PendingConfirmationKind>> = {
  prepareBookingRequest: 'BOOKING',
  prepareEventRequest: 'EVENT',
};

export function asPrepareToolResult(
  value: unknown,
): { readonly review: unknown; readonly confirmationToken: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { review?: unknown; confirmationToken?: unknown };
  if (typeof candidate.confirmationToken !== 'string' || !('review' in candidate)) return null;
  return { review: candidate.review, confirmationToken: candidate.confirmationToken };
}
