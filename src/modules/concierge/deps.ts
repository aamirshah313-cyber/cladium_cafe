/**
 * Process-lifetime deps binding for the concierge read tools — Runbook
 * Step 26. Reuses the exact same singletons the guest-facing takeaway API
 * and staff workspace already read/write (`modules/{takeaway,bookings,
 * events}/deps.ts`) — the concierge sees the same data, never a copy.
 * Consumed by Step 27's server-side chat orchestration, not by anything
 * built in this step.
 */

import { takeawayDeps } from '../takeaway/deps';
import { bookingDeps } from '../bookings/deps';
import { eventDeps } from '../events/deps';
import type { RequestStatusDeps } from './tools/get-request-status';

export const requestStatusDeps: RequestStatusDeps = {
  takeawayRequests: takeawayDeps.requestStore,
  bookingRequests: bookingDeps.requestStore,
  eventRequests: eventDeps.requestStore,
};

export const cartDeps = takeawayDeps;
