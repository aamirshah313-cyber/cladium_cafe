/**
 * Process-lifetime deps binding for the concierge — Runbook Steps 26–27.
 * The read-tool deps (`requestStatusDeps`/`cartDeps`) reuse the exact same
 * singletons the guest-facing takeaway API and staff workspace already
 * read/write (`modules/{takeaway,bookings,events}/deps.ts`) — the
 * concierge sees the same data, never a copy. `orchestratorDeps` is Step
 * 27's: the real Anthropic-backed chat client (never called live in this
 * sandbox — no `ANTHROPIC_API_KEY` — but real and typechecked, not a
 * stub), an in-memory bounded conversation store, an in-memory rate
 * limiter (same dev-only caveat as every other in-memory adapter — D-023),
 * and the redacted `consoleLogger`.
 */

import { takeawayDeps } from '../takeaway/deps';
import { bookingDeps } from '../bookings/deps';
import { eventDeps } from '../events/deps';
import { createAnthropicChatClient } from '../integrations/anthropic-client';
import { createInMemoryRateLimiter } from '../../lib/security/rate-limit';
import { createLogger } from '../../lib/logging';
import type { RequestStatusDeps } from './tools/get-request-status';
import { createInMemoryConversationStore } from './conversation-store';
import type { OrchestratorDeps } from './orchestrator';

export const requestStatusDeps: RequestStatusDeps = {
  takeawayRequests: takeawayDeps.requestStore,
  bookingRequests: bookingDeps.requestStore,
  eventRequests: eventDeps.requestStore,
};

export const cartDeps = takeawayDeps;

export const orchestratorDeps: OrchestratorDeps = {
  chatClient: createAnthropicChatClient(),
  conversationStore: createInMemoryConversationStore(),
  rateLimiter: createInMemoryRateLimiter(),
  logger: createLogger(),
};
