/**
 * Whether the *guest-facing* takeaway journey is complete enough to offer.
 *
 * This is deliberately separate from `FEATURE_TAKEAWAY_REQUESTS`, which
 * gates the takeaway **API and staff side** and is legitimately switched on
 * in the deployed environment: the cart, request, state machine, staff
 * queue and submission endpoints are all built, tested, and working.
 *
 * What does not exist yet is the one screen a guest needs after adding an
 * item — the cart/review page that shows the lines, the deterministic
 * total, and the confirm control that submits the request (tracked in
 * `.continuum/TASKS.md`: "Build the takeaway cart/review UI pages"). Every
 * candidate route for it (`/takeaway`, `/cart`, `/order`) is a 404 today,
 * verified against the deployed site.
 *
 * Offering "Add to takeaway order" without that screen is a dead end: the
 * guest adds items, watches a subtotal climb, and has nowhere to submit.
 * Worse than useless — it implies an ordering capability the site cannot
 * honour, which is the same class of promise CLAUDE.md forbids making about
 * availability, confirmation or delivery.
 *
 * So the affordance stays hidden until the destination exists. Nothing is
 * deleted or disabled underneath: the API keeps working, the concierge's
 * own takeaway tools are untouched, and staff can still receive and process
 * takeaway requests raised through other channels.
 *
 * **To activate:** build the cart/review page, then flip this to `true`.
 * That is the only change needed here — the add control, the running total
 * and the existing `POST /api/takeaway/cart/items` wiring are all already
 * in place behind it.
 */
export const TAKEAWAY_GUEST_JOURNEY_COMPLETE = false;
