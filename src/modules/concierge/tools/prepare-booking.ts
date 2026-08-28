/**
 * `prepareBookingRequest` concierge tool — Runbook Step 28
 * (`agent/tool-contracts.md`). A thin wrapper over the same
 * `modules/bookings/submission-service.ts`'s `prepareBookingRequest` and
 * `bookingDeps` singleton the manual `/book` page's review step already
 * calls — the concierge never builds a second review/token-issuance path.
 *
 * This only ever *drafts*: it echoes the review and issues a single-use
 * confirmation token, exactly like the manual flow's review step — it
 * never creates a `BookingRequestRecord`. There is no matching "submit"
 * tool in the registry at all (see `tool-registry.ts`'s doc comment) —
 * the model is structurally unable to cause a write; only a guest tapping
 * the visible confirm control in the chat UI, which calls the existing
 * `POST /api/bookings/submit` directly, can.
 */

import { bookingDeps } from '../../bookings/deps';
import { prepareBookingRequest } from '../../bookings/submission-service';
import type { PrepareBookingInput } from '../schemas';

export function prepareBookingDraft(input: PrepareBookingInput, sessionId: string) {
  return prepareBookingRequest(bookingDeps, { sessionId, ...input });
}
