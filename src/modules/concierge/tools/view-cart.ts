/**
 * `viewCart` read tool — Runbook Step 26 (`agent/tool-contracts.md`:
 * "No total calculated by the model").
 *
 * A thin re-export of `modules/takeaway/http.ts`'s already-built,
 * already-tested `getCart` — the concierge reads the guest's cart through
 * the exact same deterministic path the takeaway API route does, not a
 * second implementation. Totals always come from `recomputeCartTotals`;
 * the model only ever displays what this returns, never computes a
 * number itself.
 *
 * `sessionId` is a plain parameter here, not part of the tool's model-
 * visible schema (`viewCartInputSchema` is empty) — the caller (the
 * server-side chat orchestration built in Step 27) supplies it from the
 * guest's own verified session, the same authenticated-server-context
 * requirement `tool-contracts.md` states.
 */

import { getCart, type CartView, type TakeawayHttpDeps } from '../../takeaway/http';
import type { AppError } from '../../../lib/errors';
import type { Result } from '../../../lib/result';

export function viewCart(
  deps: TakeawayHttpDeps,
  sessionId: string,
): Promise<Result<CartView, AppError>> {
  return getCart(deps, sessionId);
}
