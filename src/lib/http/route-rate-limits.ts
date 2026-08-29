/**
 * Shared rate-limit rules and singleton limiter for guest-mutating API
 * routes — Runbook Step 40 (security and abuse verification).
 *
 * Before this step, only two routes ever checked a rate limit at all:
 * `POST /api/vapi/token` (Step 31, 5/min) and `POST /api/concierge/chat`
 * (Step 27, 10/min, enforced inside `orchestrateTurn` itself — not through
 * this module, so it is deliberately not duplicated here). Every other
 * guest-mutating route — cart edits, request review/submit, consent,
 * client-triggered Meta tracking — had no throttle at all, a real gap
 * against `release-gates-v2.md` Gate 8's "rate limits and bot/spam controls
 * are verified."
 *
 * One process-lifetime `RateLimiter` (in-memory, dev-only — same D-023
 * caveat as every other in-memory adapter in this codebase; a durable
 * production `RateLimitStoreAdapter` is a later, separately approved
 * integration) is shared by every route below. Sharing one instance is
 * safe: each rule's `consume` key is namespaced by an explicit `keyPrefix`
 * (e.g. `cart-item:<sessionId>`, `req-submit:<sessionId>`), so one guest's
 * window on one route never counts against a different route's window,
 * even though the underlying store is the same object.
 *
 * Limits are deliberately generous enough that no genuine single-session
 * guest flow (browse → review → submit, or a handful of cart edits) can
 * ever hit one — they exist to blunt scripted abuse, not to interrupt a
 * real visitor. `REQUEST_SUBMIT_RATE_LIMIT_RULE` is the tightest of the
 * guest rules because it is the one that actually creates a durable,
 * staff-visible record (data-model-v2.md §5) — the same "heavier grant,
 * tighter limit" reasoning `issue-vapi-token.ts`'s
 * `VAPI_TOKEN_RATE_LIMIT_RULE` doc comment already established for a
 * voice-call credential versus a chat turn.
 */

import { createInMemoryRateLimiter } from '../security/rate-limit';
import type { RateLimiter, RateLimitRule } from '../security/rate-limit';

/** Shared by every rule below — see the module doc comment for why one instance is safe. */
export const guestRouteRateLimiter: RateLimiter = createInMemoryRateLimiter();

/** `POST /api/takeaway/cart/items`, `PATCH`/`DELETE /api/takeaway/cart/items/[cartLineId]` — routine browsing-session editing. */
export const CART_MUTATION_RATE_LIMIT_RULE: RateLimitRule = { windowMs: 60_000, max: 30 };

/** `POST /api/{takeaway,bookings,events}/review` — computes a preview and issues a confirmation token; no durable record yet. */
export const REQUEST_REVIEW_RATE_LIMIT_RULE: RateLimitRule = { windowMs: 60_000, max: 20 };

/** `POST /api/{takeaway,bookings,events}/submit` — creates the durable, staff-visible request record (data-model-v2.md §5). */
export const REQUEST_SUBMIT_RATE_LIMIT_RULE: RateLimitRule = { windowMs: 60_000, max: 10 };

/** `POST /api/consent` — a guest toggling their own preference; generous, but still bounded. */
export const CONSENT_RATE_LIMIT_RULE: RateLimitRule = { windowMs: 60_000, max: 20 };

/** `POST /api/meta/track` — the client-triggered half of Meta measurement (Step 37); several legitimate events can fire per page. */
export const META_TRACK_RATE_LIMIT_RULE: RateLimitRule = { windowMs: 60_000, max: 60 };

/**
 * `POST /api/staff/session` sign-in attempts only — the one credential-
 * guessing surface in this codebase. Deliberately keyed by the *attempted*
 * `staffId` from the request body, not by client IP: this sandbox has no
 * live Vercel deployment against which to confirm `x-forwarded-for`'s real
 * shape (single trusted hop vs. guest-appendable list), and trusting an
 * unverified, guest-suppliable header for a security control would be a
 * false sense of protection — worse than an honestly-scoped per-account
 * limit. Tracked as a Step 43 (staging release) follow-up once a live
 * Vercel environment exists to verify the header against.
 */
export const STAFF_SIGNIN_RATE_LIMIT_RULE: RateLimitRule = { windowMs: 60_000, max: 5 };
