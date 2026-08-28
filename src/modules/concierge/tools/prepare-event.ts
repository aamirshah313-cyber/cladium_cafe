/**
 * `prepareEventRequest` concierge tool — Runbook Step 28
 * (`agent/tool-contracts.md`). A thin wrapper over the same
 * `modules/events/submission-service.ts`'s `prepareEventRequest` and
 * `eventDeps` singleton the manual `/event` page's review step already
 * calls — the concierge never builds a second review/token-issuance path.
 *
 * This only ever *drafts*: it echoes the review and issues a single-use
 * confirmation token, exactly like the manual flow's review step — it
 * never creates an `EventRequestRecord`. There is no matching "submit"
 * tool in the registry at all (see `tool-registry.ts`'s doc comment) —
 * the model is structurally unable to cause a write; only a guest tapping
 * the visible confirm control in the chat UI, which calls the existing
 * `POST /api/events/submit` directly, can.
 */

import { eventDeps } from '../../events/deps';
import { prepareEventRequest } from '../../events/submission-service';
import type { PrepareEventInput } from '../schemas';

export function prepareEventDraft(input: PrepareEventInput, sessionId: string) {
  return prepareEventRequest(eventDeps, { sessionId, ...input });
}
