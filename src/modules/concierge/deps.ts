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

/**
 * Getters, not values — the three `*Deps` objects are lazy `Proxy`s that
 * resolve their storage on first property access, and reading `.requestStore`
 * here would do exactly that at *module evaluation* time, defeating the
 * laziness for every route that transitively imports this file.
 *
 * That was invisible while a missing credential silently produced an
 * in-memory store. Now that the takeaway deps fail closed (D-089), it became
 * a build failure instead: `next build`'s page-data collection evaluates
 * route modules with no Supabase credentials present, so the eager read threw
 * and took the whole build down. A build must not require runtime secrets,
 * which is the deeper reason this belongs behind a getter regardless.
 */
export const requestStatusDeps: RequestStatusDeps = {
  get takeawayRequests() {
    return takeawayDeps.requestStore;
  },
  get bookingRequests() {
    return bookingDeps.requestStore;
  },
  get eventRequests() {
    return eventDeps.requestStore;
  },
};

export const cartDeps = takeawayDeps;

export const orchestratorDeps: OrchestratorDeps = {
  chatClient: createAnthropicChatClient(),
  conversationStore: createInMemoryConversationStore(),
  rateLimiter: createInMemoryRateLimiter(),
  logger: createLogger(),
};
