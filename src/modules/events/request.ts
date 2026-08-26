/**
 * Event request record shape — Runbook Step 19 (data-model-v2.md
 * `event_requests`). "The public starting décor statement does not create
 * or guarantee a quote" — `quotedAmountPkr` starts `null` and is only ever
 * set by a staff transition (a later capability; see `state-machine.ts`'s
 * doc comment on why no submission/staff service for `QUOTED` exists yet).
 */

import type { SourceChannel } from '../../lib/schemas/common';
import type { VersionedRecord } from '../../lib/domain/versioned-store';
import type { EventState } from './state-machine';

export interface EventRequestRecord extends VersionedRecord {
  readonly state: EventState;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly occasion: string;
  readonly requestedDate: string;
  readonly requestedTime: string;
  readonly guestCount: number;
  readonly decorInterest: boolean;
  readonly notes: string | null;
  readonly quotedAmountPkr: number | null;
  readonly sessionId: string;
  readonly sourceChannel: SourceChannel;
  readonly assignedStaffId: string | null;
  readonly createdAt: string;
}
