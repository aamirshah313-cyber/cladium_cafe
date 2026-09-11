/**
 * The takeaway Postgres cutover, proven against real Postgres.
 *
 * Every test here builds its deps through `createPostgresTakeawayDeps` — the
 * same factory the routes use — and, where the point is durability,
 * constructs **separate application instances** so nothing can pass by
 * sharing a process-level `Map`. That is the specific failure this cutover
 * exists to remove: the previous deps were entirely in-memory, so a review
 * issued on one Vercel instance and a submit landing on another could not
 * find each other's confirmation token.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresTakeawayDeps } from '../../src/modules/takeaway/deps';
import { addItem, getCart, reviewTakeaway, submitTakeaway } from '../../src/modules/takeaway/http';
import type { TakeawayHttpDeps } from '../../src/modules/takeaway/http';
import type { PublishedMenuView } from '../../src/modules/menu/menu-view';
import {
  approveMenuVersion,
  importMenuDraft,
  publishMenuVersion,
  type MenuAdminDeps,
} from '../../src/modules/menu/admin-service';
import type { Actor } from '../../src/lib/domain/actor';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

const GUEST = { guestName: 'Integration Fixture', guestPhone: '+923001234567' };

describe.skipIf(!configured)('takeaway Postgres cutover (real Postgres)', () => {
  const client: SupabaseClient = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Narrowed to the published arm: this fixture is always a published menu,
  // and the union's unpublished arm has no `categories` to spread.
  let menu: Extract<PublishedMenuView, { status: 'PUBLISHED' }>;
  let itemId: string;
  let variantItemId: string;
  let variantId: string;
  let variantPricePkr: number;
  const createdRequestIds: string[] = [];
  const staffProfileIds: string[] = [];
  let staffUserId: string | null = null;

  /**
   * Publishes the real menu so this suite has something to add to a cart.
   *
   * It publishes rather than reading whatever happens to be there because
   * `menu-guest-view.test.ts` clears every menu table in its own `afterAll`,
   * so by the time this file runs the database is empty. Standing this up
   * here — instead of leaving a hand-run helper script around — is what makes
   * `npm run test:integration` reproducible from a bare `supabase db reset`.
   */
  async function publishRealMenu(): Promise<number> {
    const { data: authUser, error: authError } = await client.auth.admin.createUser({
      email: `takeaway-cutover-fixture-${randomUUID()}@example.invalid`,
      email_confirm: true,
    });
    if (authError || !authUser.user)
      throw new Error(`auth user fixture failed: ${authError?.code}`);
    staffUserId = authUser.user.id;

    const staffId = randomUUID();
    staffProfileIds.push(staffId);
    await client
      .from('staff_profiles')
      .insert({ id: staffId, user_id: staffUserId, display_name: 'Takeaway Cutover Fixture' });
    await client
      .from('staff_role_memberships')
      .insert({ staff_profile_id: staffId, role: 'OWNER' });

    const owner: Actor = { type: 'STAFF', id: staffId, roles: ['OWNER'] };
    const deps: MenuAdminDeps = { client };

    const imported = await importMenuDraft(deps, owner, randomUUID());
    if (!imported.ok) throw new Error(`menu import failed: ${imported.error.code}`);
    const versionNumber = imported.value.versionNumber;

    const approved = await approveMenuVersion(deps, owner, versionNumber, 1, randomUUID());
    if (!approved.ok) throw new Error(`menu approve failed: ${approved.error.code}`);
    const published = await publishMenuVersion(deps, owner, versionNumber, randomUUID());
    if (!published.ok) throw new Error(`menu publish failed: ${published.error.code}`);

    return versionNumber;
  }

  /**
   * A fresh deps object built the way a cold serverless instance would.
   * `getMenuView` is pinned to the fixture menu so these tests do not depend
   * on whatever version happens to be published locally.
   */
  function newInstance(): TakeawayHttpDeps {
    return { ...createPostgresTakeawayDeps(client), getMenuView: async () => menu };
  }

  beforeAll(async () => {
    const versionNumber = await publishRealMenu();

    const { data: versionRow } = await client
      .from('menu_versions')
      .select('id')
      .eq('version_number', versionNumber)
      .single<{ id: string }>();
    if (!versionRow) throw new Error('menu version row vanished between the two reads');
    /*
     * `id`, not `stable_id` — and this is the whole point.
     *
     * This fixture originally built its menu with `id: item.stable_id`,
     * which is not what the real repository produces:
     * `modules/menu/guest-view-repository.ts` sets `MenuViewItem.id` from
     * `menu_items.id`. The cart adapter had made the same wrong assumption,
     * so the two agreed and all seven tests here passed against a contract
     * that did not exist. The first real click on "Add to takeaway order"
     * returned a 500 and an empty cart.
     *
     * Reading the same column the repository reads is what keeps this suite
     * able to fail. It is still a fixture — pinned so these tests do not
     * depend on row ordering — but it is now pinned to the
     * real shape rather than to a convenient one.
     */
    const { data: item } = await client
      .from('menu_items')
      .select('id, name, base_price_pkr')
      .eq('menu_version_id', versionRow.id)
      .not('base_price_pkr', 'is', null)
      .limit(1)
      .single<{ id: string; name: string; base_price_pkr: number }>();
    if (!item) throw new Error('the freshly published menu contains no priced item');

    /*
     * A second, *variant-bearing* item, because the priced item above has
     * none and `takeaway_items.menu_variant_id` would otherwise never be
     * exercised. It is nullable by design — a line outlives the row it came
     * from — which means a bug that always writes null looks exactly like
     * correct behaviour unless something adds a variant on purpose. That is
     * how the `stable_id` resolution bug survived: the column was null for
     * the honest reason and the dishonest one at the same time.
     */
    const { data: variantRow } = await client
      .from('menu_variants')
      .select('id, label, price_pkr, item_id')
      .eq('menu_version_id', versionRow.id)
      .limit(1)
      .single<{ id: string; label: string; price_pkr: number; item_id: string }>();
    if (!variantRow) throw new Error('the freshly published menu contains no variant');

    const { data: variantParent } = await client
      .from('menu_items')
      .select('id, name, base_price_pkr')
      .eq('id', variantRow.item_id)
      .single<{ id: string; name: string; base_price_pkr: number | null }>();
    if (!variantParent) throw new Error('the variant has no parent item');

    variantItemId = variantParent.id;
    variantId = variantRow.id;
    variantPricePkr = variantRow.price_pkr;

    itemId = item.id;
    menu = {
      status: 'PUBLISHED',
      versionNumber,
      categories: [
        {
          id: 'fixture',
          mediaKey: 'steaks',
          name: 'Fixture',
          items: [
            {
              id: item.id,
              name: item.name,
              groupLabel: null,
              availability: 'AVAILABLE',
              basePricePkr: item.base_price_pkr,
              variants: [],
              isSignature: false,
              serves: null,
              servedWith: null,
            },
            {
              id: variantParent.id,
              name: variantParent.name,
              groupLabel: null,
              availability: 'AVAILABLE',
              basePricePkr: variantParent.base_price_pkr,
              variants: [
                { id: variantRow.id, label: variantRow.label, pricePkr: variantRow.price_pkr },
              ],
              isSignature: false,
              serves: null,
              servedWith: null,
            },
          ],
        },
      ],
    };
  });

  afterAll(async () => {
    // Requests and their lines are removable; the append-only status/audit
    // ledgers are not, by trigger, and are deliberately left alone.
    for (const id of createdRequestIds) {
      await client.from('takeaway_items').delete().eq('takeaway_request_id', id);
      await client.from('outbox_events').delete().eq('entity_id', id);
      await client.from('takeaway_requests').delete().eq('id', id);
    }

    // Carts hold a foreign key into the menu rows, so they go first, and
    // `customer_sessions` after the carts that reference it. FK-safe order,
    // same convention as menu-guest-view.test.ts.
    await client.from('cart_items').delete().neq('id', randomUUID());
    await client.from('carts').delete().neq('id', randomUUID());
    await client.from('menu_variants').delete().neq('id', randomUUID());
    await client.from('menu_items').delete().neq('id', randomUUID());
    await client.from('menu_categories').delete().neq('id', randomUUID());
    await client.from('menu_versions').delete().neq('id', randomUUID());
    for (const id of staffProfileIds) {
      await client.from('staff_profiles').delete().eq('id', id);
    }
    if (staffUserId) await client.auth.admin.deleteUser(staffUserId);
  });

  async function seedCart(sessionId: string, quantity = 2) {
    const deps = newInstance();
    const added = await addItem(deps, sessionId, { menuItemId: itemId, quantity });
    if (!added.ok) throw new Error(`seed failed: ${added.error.code}`);
    return added.value.totals;
  }

  it('a cart written by one instance is readable by another', async () => {
    const sessionId = randomUUID();
    const totals = await seedCart(sessionId, 2);

    // A different instance entirely — nothing shared but Postgres.
    const other = await getCart(newInstance(), sessionId);
    expect(other.ok).toBe(true);
    if (other.ok) {
      expect(other.value.cart.lines).toHaveLength(1);
      expect(other.value.totals.subtotalPkr).toBe(totals.subtotalPkr);
    }
  });

  it('review on one instance, submit on another — the token crosses the gap', async () => {
    const sessionId = randomUUID();
    await seedCart(sessionId);

    const reviewed = await reviewTakeaway(newInstance(), sessionId, GUEST);
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) return;

    const submitted = await submitTakeaway(newInstance(), sessionId, {
      ...GUEST,
      sourceChannel: 'WEB',
      confirmationToken: reviewed.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    expect(submitted.ok).toBe(true);
    if (submitted.ok) createdRequestIds.push(submitted.value.requestId);
  });

  it('writes the request, its lines, status, audit and outbox in one commit', async () => {
    const sessionId = randomUUID();
    await seedCart(sessionId, 3);
    const reviewed = await reviewTakeaway(newInstance(), sessionId, GUEST);
    if (!reviewed.ok) throw new Error('review failed');

    const submitted = await submitTakeaway(newInstance(), sessionId, {
      ...GUEST,
      sourceChannel: 'WEB',
      confirmationToken: reviewed.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    if (!submitted.ok) throw new Error(`submit failed: ${submitted.error.code}`);
    const id = submitted.value.requestId;
    createdRequestIds.push(id);

    const [request, items, status, audit, outbox] = await Promise.all([
      client.from('takeaway_requests').select('id, state, total_pkr').eq('id', id).maybeSingle(),
      client
        .from('takeaway_items')
        .select('id, quantity, menu_item_id')
        .eq('takeaway_request_id', id),
      client.from('status_events').select('id, new_state').eq('entity_id', id),
      client.from('audit_events').select('id, action').eq('entity_id', id),
      client.from('outbox_events').select('id, destination, status').eq('entity_id', id),
    ]);

    expect(request.data).not.toBeNull();
    expect(items.data).toHaveLength(1);
    expect(items.data?.[0]?.quantity).toBe(3);
    /*
     * The column is nullable on purpose — a line outlives the menu row it
     * came from — but for a request submitted seconds ago against a live
     * menu, null means the resolution failed silently. It did: the function
     * matched `stable_id` against an id, and a scalar subquery that finds
     * nothing writes null rather than raising, so this whole traceability
     * link was being lost inside a transaction that reported success.
     */
    expect(items.data?.[0]?.menu_item_id).toBe(itemId);
    expect(status.data).toHaveLength(1);
    expect(audit.data).toHaveLength(1);
    // The row that makes staff notification possible, in the same commit as
    // the request it announces.
    expect(outbox.data).toHaveLength(1);
    expect(outbox.data?.[0]?.destination).toBe('staff_notification');
  });

  it('carries an explicitly chosen variant through to a populated menu_variant_id', async () => {
    const sessionId = randomUUID();
    const deps = newInstance();
    const added = await addItem(deps, sessionId, {
      menuItemId: variantItemId,
      variantId,
      quantity: 2,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error(`variant add failed: ${added.error.code}`);

    // The variant's price, not the parent item's base price.
    expect(added.value.totals.subtotalPkr).toBe(variantPricePkr * 2);

    const reviewed = await reviewTakeaway(newInstance(), sessionId, GUEST);
    if (!reviewed.ok) throw new Error('review failed');
    const submitted = await submitTakeaway(newInstance(), sessionId, {
      ...GUEST,
      sourceChannel: 'WEB',
      confirmationToken: reviewed.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    if (!submitted.ok) throw new Error(`submit failed: ${submitted.error.code}`);
    createdRequestIds.push(submitted.value.requestId);

    const { data: lines } = await client
      .from('takeaway_items')
      .select('menu_item_id, menu_variant_id, variant_label, unit_price_pkr')
      .eq('takeaway_request_id', submitted.value.requestId);

    expect(lines).toHaveLength(1);
    expect(lines?.[0]?.menu_item_id).toBe(variantItemId);
    /*
     * The assertion the whole variant fixture exists for. `menu_variant_id`
     * is nullable, so a resolution bug writes null and looks identical to
     * the legitimate "that variant no longer exists" case. Nothing caught
     * the `stable_id` mismatch here until a line deliberately carried a
     * variant that definitely does exist.
     */
    expect(lines?.[0]?.menu_variant_id).toBe(variantId);
    // The label is snapshotted independently, because it is what a guest
    // reads and it must survive the variant row being deleted.
    expect(lines?.[0]?.variant_label).not.toBeNull();
    expect(lines?.[0]?.unit_price_pkr).toBe(variantPricePkr);
  });

  it('a submission that fails leaves nothing behind — no request, no notification', async () => {
    const sessionId = randomUUID();
    await seedCart(sessionId);
    const reviewed = await reviewTakeaway(newInstance(), sessionId, GUEST);
    if (!reviewed.ok) throw new Error('review failed');

    /*
     * Forces a failure *inside* the transaction by naming a menu version
     * that does not exist. The function raises after resolving nothing, so
     * if the five writes were still five separate calls this would be the
     * case that stranded a request without its outbox event.
     */
    const deps = newInstance();
    const broken: TakeawayHttpDeps = {
      ...deps,
      getMenuView: async () => ({ ...menu, versionNumber: 987_654 }),
    };

    const before = await client
      .from('takeaway_requests')
      .select('id', { count: 'exact', head: true });
    const result = await submitTakeaway(broken, sessionId, {
      ...GUEST,
      sourceChannel: 'WEB',
      confirmationToken: reviewed.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    }).catch(() => ({ ok: false as const }));
    expect(result.ok).toBe(false);

    const after = await client
      .from('takeaway_requests')
      .select('id', { count: 'exact', head: true });
    expect(after.count).toBe(before.count);
  });

  it('two concurrent duplicate submissions create exactly one request', async () => {
    const sessionId = randomUUID();
    await seedCart(sessionId);
    const reviewed = await reviewTakeaway(newInstance(), sessionId, GUEST);
    if (!reviewed.ok) throw new Error('review failed');

    const payload = {
      ...GUEST,
      sourceChannel: 'WEB' as const,
      confirmationToken: reviewed.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    };

    // Two separate instances, genuinely in parallel.
    const [a, b] = await Promise.all([
      submitTakeaway(newInstance(), sessionId, payload),
      submitTakeaway(newInstance(), sessionId, payload),
    ]);

    const succeeded = [a, b].filter((r) => r.ok);
    expect(succeeded).toHaveLength(1);
    const id = succeeded[0]?.ok ? succeeded[0].value.requestId : null;
    if (id) createdRequestIds.push(id);

    const rows = await client
      .from('takeaway_requests')
      .select('id')
      .eq('id', id ?? '');
    expect(rows.data).toHaveLength(1);
  });

  it('a retry after a lost response returns the original request id', async () => {
    const sessionId = randomUUID();
    await seedCart(sessionId);
    const reviewed = await reviewTakeaway(newInstance(), sessionId, GUEST);
    if (!reviewed.ok) throw new Error('review failed');

    const payload = {
      ...GUEST,
      sourceChannel: 'WEB' as const,
      confirmationToken: reviewed.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    };

    const first = await submitTakeaway(newInstance(), sessionId, payload);
    expect(first.ok).toBe(true);
    if (first.ok) createdRequestIds.push(first.value.requestId);

    // The cart is gone and the response never reached the guest. A fresh
    // instance retries the identical call.
    const retry = await submitTakeaway(newInstance(), sessionId, payload);
    expect(retry.ok).toBe(true);
    if (first.ok && retry.ok) expect(retry.value.requestId).toBe(first.value.requestId);

    const rows = await client
      .from('takeaway_requests')
      .select('id')
      .eq('id', first.ok ? first.value.requestId : '');
    expect(rows.data).toHaveLength(1);
  });

  it('rejects an empty cart, a stale review and a foreign token', async () => {
    const sessionId = randomUUID();
    await seedCart(sessionId);
    const reviewed = await reviewTakeaway(newInstance(), sessionId, GUEST);
    if (!reviewed.ok) throw new Error('review failed');

    // Stale review: the menu moved under the token, so its review hash no
    // longer matches what would be recomputed now.
    const moved: TakeawayHttpDeps = {
      ...newInstance(),
      getMenuView: async () => ({
        ...menu,
        categories: [
          {
            ...menu.categories[0]!,
            items: [{ ...menu.categories[0]!.items[0]!, basePricePkr: 999_99 }],
          },
        ],
      }),
    };
    const stale = await submitTakeaway(moved, sessionId, {
      ...GUEST,
      sourceChannel: 'WEB',
      confirmationToken: reviewed.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('STALE_REVIEW');

    // A token issued to a different session must not work here.
    const otherSession = randomUUID();
    await seedCart(otherSession);
    const otherReview = await reviewTakeaway(newInstance(), otherSession, GUEST);
    if (!otherReview.ok) throw new Error('review failed');
    const foreign = await submitTakeaway(newInstance(), sessionId, {
      ...GUEST,
      sourceChannel: 'WEB',
      confirmationToken: otherReview.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    expect(foreign.ok).toBe(false);

    // An empty cart cannot become a request.
    const emptySession = randomUUID();
    const empty = await submitTakeaway(newInstance(), emptySession, {
      ...GUEST,
      sourceChannel: 'WEB',
      confirmationToken: reviewed.value.confirmationToken,
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
    });
    expect(empty.ok).toBe(false);
  });
});
