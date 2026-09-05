/**
 * Real-Postgres tests for the guest-facing published-menu read side
 * (Step 19, `modules/menu/guest-view-repository.ts`) — proves the
 * draft/approve/publish visibility boundary through the actual anon-key
 * client the app uses in production, not just the RLS policies in
 * isolation (`scripts/db/rls-tests.sql`/`npm run db:test:rls` already
 * cover those directly, with `set role anon`).
 *
 * Seeds via the real `modules/menu/admin-service.ts` functions — the same
 * code path `/staff/menu` uses — with a service-role client, then reads
 * back with a *second*, anon-key client: the only client
 * `fetchPublishedMenuView` is ever given in production
 * (`supabase-public-client.ts`).
 *
 * Assertions track each fixture's own ids rather than assuming the table
 * starts empty — the same "verified, not trusted" discipline
 * `postgres-outbox-store.test.ts` established, since another integration
 * test file's residual state may still be present.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  approveMenuVersion,
  publishMenuVersion,
  type MenuAdminDeps,
} from '../../src/modules/menu/admin-service';
import { fetchPublishedMenuView } from '../../src/modules/menu/guest-view-repository';
import type { Actor } from '../../src/lib/domain/actor';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const configured = Boolean(url && serviceRoleKey && anonKey);

describe.skipIf(!configured)(
  'guest-facing published-menu read side (real Postgres, real RLS)',
  () => {
    const serviceClient = createClient(url ?? '', serviceRoleKey ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anonClient = createClient(url ?? '', anonKey ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const deps: MenuAdminDeps = { client: serviceClient };

    let staffUserId: string;
    let ownerActor: Actor;
    const staffProfileIds: string[] = [];
    const syntheticVersionNumbers: number[] = [];

    beforeAll(async () => {
      // menu_versions.approved_by has a real foreign key into
      // staff_profiles, itself a real foreign key into auth.users -- same
      // fixture pattern menu-admin-service.test.ts already established.
      const { data: authUser, error: authError } = await serviceClient.auth.admin.createUser({
        email: `menu-guest-view-fixture-${randomUUID()}@example.invalid`,
        email_confirm: true,
      });
      if (authError || !authUser.user) {
        throw new Error(`auth user fixture failed: ${authError?.message}`);
      }
      staffUserId = authUser.user.id;
      const staffId = randomUUID();
      staffProfileIds.push(staffId);
      const { error: profileError } = await serviceClient
        .from('staff_profiles')
        .insert({ id: staffId, user_id: staffUserId, display_name: 'Menu Guest View Fixture' });
      if (profileError) throw new Error(`staff profile fixture failed: ${profileError.message}`);
      await serviceClient
        .from('staff_role_memberships')
        .insert({ staff_profile_id: staffId, role: 'OWNER' });

      ownerActor = { type: 'STAFF', id: staffId, roles: ['OWNER'] };
    });

    afterAll(async () => {
      // No append-only trigger on these four tables, so a real cleanup is
      // possible -- FK-safe order, same convention as menu-admin-service.test.ts.
      await serviceClient.from('menu_variants').delete().neq('id', randomUUID());
      await serviceClient.from('menu_items').delete().neq('id', randomUUID());
      await serviceClient.from('menu_categories').delete().neq('id', randomUUID());
      await serviceClient.from('menu_versions').delete().neq('id', randomUUID());
      for (const id of staffProfileIds) {
        await serviceClient.from('staff_profiles').delete().eq('id', id);
      }
      if (staffUserId) await serviceClient.auth.admin.deleteUser(staffUserId);
    });

    /** Inserts a synthetic DRAFT version with one real category+item, so there is actual guest-shaped content to prove absent/present. */
    async function insertDraftVersionWithContent(
      label: string,
    ): Promise<{ versionNumber: number; itemId: string; itemName: string }> {
      const versionNumber =
        900000 + syntheticVersionNumbers.length + Math.floor(Math.random() * 90000);
      syntheticVersionNumbers.push(versionNumber);

      const { data: versionRow, error: versionError } = await serviceClient
        .from('menu_versions')
        .insert({ version_number: versionNumber, source_checksum: randomBytes(24).toString('hex') })
        .select('id')
        .single();
      if (versionError || !versionRow) {
        throw new Error(`draft version fixture failed: ${versionError?.message}`);
      }

      const { data: categoryRow, error: categoryError } = await serviceClient
        .from('menu_categories')
        .insert({
          menu_version_id: versionRow.id,
          stable_id: `${label}-category`,
          name: `${label} category`,
          sort_order: 0,
        })
        .select('id')
        .single();
      if (categoryError || !categoryRow) {
        throw new Error(`category fixture failed: ${categoryError?.message}`);
      }

      const itemName = `${label} item`;
      const { data: itemRow, error: itemError } = await serviceClient
        .from('menu_items')
        .insert({
          menu_version_id: versionRow.id,
          category_id: categoryRow.id,
          stable_id: `${label}-item`,
          name: itemName,
          base_price_pkr: 100,
          sort_order: 0,
        })
        .select('id')
        .single();
      if (itemError || !itemRow) throw new Error(`item fixture failed: ${itemError?.message}`);

      return { versionNumber, itemId: itemRow.id as string, itemName };
    }

    async function anonSeesItem(itemId: string): Promise<boolean> {
      const { data } = await anonClient.from('menu_items').select('id').eq('id', itemId);
      return (data?.length ?? 0) > 0;
    }

    let versionA: { versionNumber: number; itemId: string; itemName: string };
    let versionB: { versionNumber: number; itemId: string; itemName: string };

    it('an imported draft is never guest-visible', async () => {
      versionA = await insertDraftVersionWithContent('draft-a');
      expect(await anonSeesItem(versionA.itemId)).toBe(false);

      const view = await fetchPublishedMenuView({ client: anonClient });
      if (view.status === 'PUBLISHED') {
        expect(view.versionNumber).not.toBe(versionA.versionNumber);
      }
    });

    it('approving alone still does not make the version guest-visible', async () => {
      const approved = await approveMenuVersion(
        deps,
        ownerActor,
        versionA.versionNumber,
        1,
        randomUUID(),
      );
      expect(approved.ok).toBe(true);
      expect(await anonSeesItem(versionA.itemId)).toBe(false);
    });

    it('publishing makes exactly that version guest-visible, with real content intact', async () => {
      const published = await publishMenuVersion(
        deps,
        ownerActor,
        versionA.versionNumber,
        randomUUID(),
      );
      expect(published.ok).toBe(true);

      expect(await anonSeesItem(versionA.itemId)).toBe(true);

      const view = await fetchPublishedMenuView({ client: anonClient });
      expect(view.status).toBe('PUBLISHED');
      if (view.status !== 'PUBLISHED') return;
      expect(view.versionNumber).toBe(versionA.versionNumber);
      const allItems = view.categories.flatMap((c) => c.items);
      const found = allItems.find((i) => i.id === versionA.itemId);
      expect(found).toBeDefined();
      expect(found?.name).toBe(versionA.itemName);
      expect(found?.basePricePkr).toBe(100);
    });

    it('two consecutive reads return identical output — one single source, not two', async () => {
      const first = await fetchPublishedMenuView({ client: anonClient });
      const second = await fetchPublishedMenuView({ client: anonClient });
      expect(second).toEqual(first);
    });

    it('a second, still-DRAFT version never appears while the first stays published', async () => {
      versionB = await insertDraftVersionWithContent('draft-b');
      expect(await anonSeesItem(versionB.itemId)).toBe(false);

      const view = await fetchPublishedMenuView({ client: anonClient });
      expect(view.status).toBe('PUBLISHED');
      if (view.status !== 'PUBLISHED') return;
      expect(view.versionNumber).toBe(versionA.versionNumber);
      const allItemIds = view.categories.flatMap((c) => c.items.map((i) => i.id));
      expect(allItemIds).not.toContain(versionB.itemId);
    });

    it('publishing the new version immediately supersedes the old one', async () => {
      await approveMenuVersion(deps, ownerActor, versionB.versionNumber, 1, randomUUID());
      const published = await publishMenuVersion(
        deps,
        ownerActor,
        versionB.versionNumber,
        randomUUID(),
      );
      expect(published.ok).toBe(true);

      const view = await fetchPublishedMenuView({ client: anonClient });
      expect(view.status).toBe('PUBLISHED');
      if (view.status !== 'PUBLISHED') return;
      expect(view.versionNumber).toBe(versionB.versionNumber);
      const allItemIds = view.categories.flatMap((c) => c.items.map((i) => i.id));
      expect(allItemIds).toContain(versionB.itemId);
      expect(allItemIds).not.toContain(versionA.itemId);

      // The now-archived version's own content is gone from anon's view...
      expect(await anonSeesItem(versionA.itemId)).toBe(false);
      // ...and so is its version metadata: once unpublished, even the
      // menu_versions row itself disappears from guest visibility, not
      // merely its items (menu_versions_public_read requires
      // `published_at is not null`).
      const { data: oldVersionRows } = await anonClient
        .from('menu_versions')
        .select('id')
        .eq('version_number', versionA.versionNumber);
      expect(oldVersionRows?.length ?? 0).toBe(0);
    });
  },
);
