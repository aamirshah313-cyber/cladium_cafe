/**
 * Takeaway request record shapes — Runbook Step 19 (data-model-v2.md
 * `takeaway_requests` / `takeaway_items`).
 *
 * `TakeawayItemSnapshot` is immutable once written: "Historical lines do
 * not change when the menu changes" — it is never updated after
 * `submission-service.ts` creates it, only appended (see
 * `lib/domain/sink.ts`).
 */

import type { SourceChannel } from '../../lib/schemas/common';
import type { VersionedRecord } from '../../lib/domain/versioned-store';
import type { TakeawayState } from './state-machine';

export interface TakeawayRequestRecord extends VersionedRecord {
  readonly state: TakeawayState;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly menuVersionNumber: number;
  readonly subtotalPkr: number;
  readonly adjustmentsPkr: number;
  readonly totalPkr: number;
  readonly requestedCollectionNote: string | null;
  readonly notes: string | null;
  readonly sessionId: string;
  readonly sourceChannel: SourceChannel;
  readonly assignedStaffId: string | null;
  readonly createdAt: string;
}

export interface TakeawayItemSnapshot {
  readonly id: string;
  readonly takeawayRequestId: string;
  readonly menuItemId: string;
  readonly name: string;
  readonly variantLabel: string | null;
  readonly unitPricePkr: number;
  readonly quantity: number;
  readonly lineTotalPkr: number;
}
