/**
 * Session-owned cart storage — Runbook Step 20 (data-model-v2.md `carts`).
 *
 * Keyed by session ID, one active cart per session — a guest can only ever
 * fetch or mutate the cart stored under *their own* verified session ID
 * (`lib/customer-session.ts`), so cross-session access isn't a check to
 * remember, it's a property of how the store is keyed.
 *
 * In-memory and explicitly not durable, same caveat as
 * `security/rate-limit.ts`'s in-memory adapter: state is per-process, lost
 * on restart/redeploy, and does not coordinate across concurrent Vercel
 * function instances. A real adapter (Supabase `carts`/`cart_items`) is a
 * later, separately built integration — see `.continuum/DECISIONS.md`.
 */

import type { Cart } from './cart';

export interface CartStore {
  get(sessionId: string): Promise<Cart | null>;
  save(cart: Cart): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

export function createInMemoryCartStore(): CartStore & {
  readonly carts: ReadonlyMap<string, Cart>;
} {
  const carts = new Map<string, Cart>();
  return {
    carts,
    async get(sessionId) {
      return carts.get(sessionId) ?? null;
    },
    async save(cart) {
      carts.set(cart.sessionId, cart);
    },
    async clear(sessionId) {
      carts.delete(sessionId);
    },
  };
}
