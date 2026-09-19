/**
 * Durable cart storage — the `carts`/`cart_items` adapter the in-memory
 * store has been standing in for since Step 20.
 *
 * ## Why the cart has to be durable too
 *
 * It looks like the least important of the takeaway stores; it is not. On
 * Vercel every request may land on a different instance, so a per-process
 * `Map` means a guest can add an item on one instance and find an empty cart
 * on the next. Nothing about that is intermittent enough to be obvious in
 * testing and nothing about it is recoverable for the guest.
 *
 * ## One id space, verified rather than assumed
 *
 * This adapter first translated between the menu's *stable ids* and the
 * tables' row uuids, on the assumption that `CartLine.menuItemId` carried a
 * stable id. It does not. `modules/menu/guest-view-repository.ts` builds
 * `MenuViewItem.id` from `menu_items.id` and `MenuViewVariant.id` from
 * `menu_variants.id` — both row uuids. Only `MenuViewCategory.mediaKey`
 * carries a stable id, and carts do not reference categories. The domain and
 * the foreign keys were already in the same space, so no translation belongs
 * here.
 *
 * That mistake survived the whole integration suite because its fixture menu
 * was built with `id: stable_id`, so the test and the adapter shared one
 * wrong assumption and agreed with each other. It failed on the first real
 * "Add to takeaway order" click. A fixture that encodes the same assumption
 * as the code under test cannot falsify it — which is why the browser
 * journey is verified through the real controls rather than by seeding.
 *
 * ## Why nothing is filtered on read
 *
 * The earlier version dropped lines whose menu row it could not resolve, to
 * avoid a permanently unopenable cart. That was the adapter deciding a
 * question the domain already answers: `recomputeCartTotals` pins a cart to
 * its menu version, returns `staleReview()` once the published version has
 * moved, and `notFound()` for a line the pinned version no longer contains.
 * Dropping a line here would have contradicted that — the guest would see a
 * shorter cart, with a matching subtotal and no explanation. Rows are
 * returned as stored; what a line is worth stays the domain's call, re-read
 * from the published menu every time, so nothing here can pin a stale price.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { assertServerOnly } from '../server-only';
import type { Cart, CartLine } from '../../modules/takeaway/cart';
import type { CartStore } from '../../modules/takeaway/cart-store';

assertServerOnly('src/lib/db/postgres-cart-store.ts');

/** Matches `postgres-customer-session.ts` — see its note on why this is a stated simplification. */
function sessionTokenHash(sessionId: string): string {
  return createHash('sha256').update(sessionId, 'utf8').digest('hex');
}

interface CartRow {
  readonly id: string;
  readonly session_id: string;
  readonly menu_version_id: string;
}

interface CartItemRow {
  readonly menu_item_id: string;
  readonly menu_variant_id: string | null;
  readonly quantity: number;
}

export function createPostgresCartStore(client: SupabaseClient): CartStore {
  async function menuVersion(versionNumber: number): Promise<{ id: string } | null> {
    const { data, error } = await client
      .from('menu_versions')
      .select('id')
      .eq('version_number', versionNumber)
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(`menu version lookup failed: ${error.code ?? 'unknown'}`);
    return data;
  }

  return {
    async get(sessionId: string): Promise<Cart | null> {
      const { data: cart, error } = await client
        .from('carts')
        .select('id, session_id, menu_version_id')
        .eq('session_id', sessionId)
        .maybeSingle<CartRow>();
      if (error) throw new Error(`cart lookup failed: ${error.code ?? 'unknown'}`);
      if (!cart) return null;

      const { data: version, error: versionError } = await client
        .from('menu_versions')
        .select('version_number')
        .eq('id', cart.menu_version_id)
        .maybeSingle<{ version_number: number }>();
      if (versionError) throw new Error(`menu version read failed: ${versionError.code}`);
      if (!version) return null;

      const { data: rows, error: itemsError } = await client
        .from('cart_items')
        .select('menu_item_id, menu_variant_id, quantity')
        .eq('cart_id', cart.id);
      if (itemsError) throw new Error(`cart items read failed: ${itemsError.code ?? 'unknown'}`);

      const lines: CartLine[] = ((rows ?? []) as CartItemRow[]).map((row) => ({
        // Rebuilt exactly as `addItemToCart` mints it, so a line read back
        // from Postgres is indistinguishable from one that never left memory.
        id: `${row.menu_item_id}:${row.menu_variant_id ?? 'single'}`,
        menuItemId: row.menu_item_id,
        variantId: row.menu_variant_id,
        quantity: row.quantity,
      }));

      return {
        id: cart.id,
        sessionId: cart.session_id,
        menuVersionNumber: version.version_number,
        lines,
      };
    },

    async save(cart: Cart): Promise<void> {
      const version = await menuVersion(cart.menuVersionNumber);
      if (!version)
        throw new Error(`no menu version with version_number ${cart.menuVersionNumber}`);

      // `carts.session_id` carries a real foreign key into
      // `customer_sessions`, which the guest-session layer never writes
      // (D-078/D-079). Same fix as every other adapter carrying that key.
      const { error: sessionError } = await client.from('customer_sessions').upsert(
        {
          id: cart.sessionId,
          token_hash: sessionTokenHash(cart.sessionId),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (sessionError) throw new Error(`session upsert failed: ${sessionError.code ?? 'unknown'}`);

      const { data: saved, error: cartError } = await client
        .from('carts')
        .upsert(
          {
            id: cart.id,
            session_id: cart.sessionId,
            menu_version_id: version.id,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'session_id' },
        )
        .select('id')
        .single<{ id: string }>();
      if (cartError) throw new Error(`cart save failed: ${cartError.code ?? 'unknown'}`);

      /*
       * Lines are replaced wholesale rather than diffed. The cart is small,
       * the domain hands us the complete desired state, and a diff would be
       * three round-trips of bookkeeping to save one. This is not atomic with
       * the delete below — a crash between them leaves an empty cart, which
       * is recoverable by the guest and loses nothing that was confirmed.
       * The submission, where a partial write is *not* recoverable, is the
       * one that gets a real transaction.
       */
      const { error: deleteError } = await client
        .from('cart_items')
        .delete()
        .eq('cart_id', saved.id);
      if (deleteError) throw new Error(`cart clear failed: ${deleteError.code ?? 'unknown'}`);

      if (cart.lines.length === 0) return;

      // The line ids are the menu rows' own primary keys, so they go in as
      // they are. A line naming a row that does not exist is rejected by the
      // foreign key rather than by a lookup here — the database is already
      // the authority on that, and asking it separately only invents a race.
      const rows = cart.lines.map((line) => ({
        cart_id: saved.id,
        menu_item_id: line.menuItemId,
        menu_variant_id: line.variantId,
        quantity: line.quantity,
      }));

      const { error: insertError } = await client.from('cart_items').insert(rows);
      if (insertError) throw new Error(`cart items save failed: ${insertError.code ?? 'unknown'}`);
    },

    async clear(sessionId: string): Promise<void> {
      // `cart_items` goes with it by cascade; deleting the cart is enough.
      const { error } = await client.from('carts').delete().eq('session_id', sessionId);
      if (error) throw new Error(`cart delete failed: ${error.code ?? 'unknown'}`);
    },
  };
}
