/**
 * Real-Postgres tests for `modules/menu/admin-service.ts` — the first test
 * anywhere in this project to exercise the actual `menu.json` (118 items,
 * 12 categories) end to end: import → review/diff → approve → publish,
 * against the real `menu_import_draft`/`menu_publish_version` functions.
 *
 * Every prior integration test used small, synthetic fixtures. This one
 * deliberately does not — a wiring mistake in the category/item stable-id
 * resolution, or a structural assumption `import-plan.ts`'s own tests
 * never had to check against the full real file, is exactly the kind of
 * thing only running the real content would catch.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  approveMenuVersion,
  getMenuVersionDetail,
  importMenuDraft,
  listMenuVersions,
  publishMenuVersion,
  type MenuAdminDeps,
} from '../../src/modules/menu/admin-service';
import type { Actor } from '../../src/lib/domain/actor';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

describe.skipIf(!configured)('menu admin-service (real Postgres, real menu.json)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deps: MenuAdminDeps = { client };

  let staffUserId: string;
  let ownerActor: Actor;
  let guestActor: Actor;
  const staffProfileIds: string[] = [];

  beforeAll(async () => {
    // menu_versions.approved_by has a real foreign key into staff_profiles,
    // which itself has a real foreign key into auth.users -- the GoTrue
    // admin API is the route that satisfies both without a raw SQL insert,
    // the same fixture pattern D-070's quote test used.
    const { data: authUser, error: authError } = await client.auth.admin.createUser({
      email: `menu-admin-fixture-${randomUUID()}@example.invalid`,
      email_confirm: true,
    });
    if (authError || !authUser.user) {
      throw new Error(`auth user fixture failed: ${authError?.message}`);
    }
    staffUserId = authUser.user.id;
    const staffId = randomUUID();
    staffProfileIds.push(staffId);
    const { error: profileError } = await client
      .from('staff_profiles')
      .insert({ id: staffId, user_id: staffUserId, display_name: 'Menu Admin Fixture' });
    if (profileError) throw new Error(`staff profile fixture failed: ${profileError.message}`);
    await client
      .from('staff_role_memberships')
      .insert({ staff_profile_id: staffId, role: 'OWNER' });

    ownerActor = { type: 'STAFF', id: staffId, roles: ['OWNER'] };
    guestActor = { type: 'GUEST', id: randomUUID() };
  });

  afterAll(async () => {
    // menu_versions/categories/items/variants carry no append-only trigger,
    // so a real cleanup is possible and done in FK-safe order.
    await client.from('menu_variants').delete().neq('id', randomUUID());
    await client.from('menu_items').delete().neq('id', randomUUID());
    await client.from('menu_categories').delete().neq('id', randomUUID());
    await client.from('menu_versions').delete().neq('id', randomUUID());
    for (const id of staffProfileIds) {
      await client.from('staff_profiles').delete().eq('id', id);
    }
    if (staffUserId) await client.auth.admin.deleteUser(staffUserId);
  });

  it('refuses to import for a GUEST actor', async () => {
    const result = await importMenuDraft(deps, guestActor, randomUUID());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('imports the real menu.json: 12 categories, 118 items, matching the verified baseline', async () => {
    const result = await importMenuDraft(deps, ownerActor, randomUUID());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.alreadyImported).toBe(false);

    const detail = await getMenuVersionDetail(deps, result.value.versionNumber);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.categories).toHaveLength(12);
    expect(detail.value.items).toHaveLength(118);
    expect(detail.value.version.reviewStatus).toBe('DRAFT');
    expect(detail.value.version.publishedAt).toBeNull();

    // Every category resolves to a real photo — proves the stable-id
    // scheme this import used is the exact one media-mapping.ts (D-060)
    // keys against, not a coincidentally similar one.
    for (const category of detail.value.categories) {
      expect(detail.value.photosByCategory[category.stableId]).not.toBeNull();
    }

    // First-ever import: nothing was previously published, so the diff
    // reports everything as newly added.
    expect(detail.value.diff.summary.categoriesAdded).toBe(12);
    expect(detail.value.diff.summary.itemsAdded).toBe(118);
  });

  it('repeating the import with unchanged content is a no-op, not a duplicate version', async () => {
    const first = await importMenuDraft(deps, ownerActor, randomUUID());
    if (!first.ok) throw new Error('first import failed');

    const second = await importMenuDraft(deps, ownerActor, randomUUID());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.alreadyImported).toBe(true);
    expect(second.value.versionNumber).toBe(first.value.versionNumber);

    const all = await listMenuVersions(deps);
    expect(all.ok).toBe(true);
    if (all.ok) expect(all.value).toHaveLength(1);
  });

  it('refuses to publish a DRAFT version that has not been approved', async () => {
    const imported = await importMenuDraft(deps, ownerActor, randomUUID());
    if (!imported.ok) throw new Error('import failed');

    const result = await publishMenuVersion(
      deps,
      ownerActor,
      imported.value.versionNumber,
      randomUUID(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses to approve for a GUEST actor', async () => {
    const imported = await importMenuDraft(deps, ownerActor, randomUUID());
    if (!imported.ok) throw new Error('import failed');

    const result = await approveMenuVersion(
      deps,
      guestActor,
      imported.value.versionNumber,
      1,
      randomUUID(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('refuses to approve on a stale expectedVersion', async () => {
    const imported = await importMenuDraft(deps, ownerActor, randomUUID());
    if (!imported.ok) throw new Error('import failed');

    const result = await approveMenuVersion(
      deps,
      ownerActor,
      imported.value.versionNumber,
      99,
      randomUUID(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('approves, then publishes, and the public-menu read path stays untouched', async () => {
    const imported = await importMenuDraft(deps, ownerActor, randomUUID());
    if (!imported.ok) throw new Error('import failed');
    const versionNumber = imported.value.versionNumber;

    const approved = await approveMenuVersion(deps, ownerActor, versionNumber, 1, randomUUID());
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.reviewStatus).toBe('APPROVED');
    expect(approved.value.approvedBy).toBe(ownerActor.id);

    const published = await publishMenuVersion(deps, ownerActor, versionNumber, randomUUID());
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.publishedAt).not.toBeNull();

    // Row-level proof, not just the service's own report of success.
    const { data: catStates } = await client
      .from('menu_categories')
      .select('publish_state')
      .eq('menu_version_id', await getRowId(versionNumber));
    expect(catStates?.every((r) => r.publish_state === 'PUBLISHED')).toBe(true);

    const { count } = await client
      .from('menu_versions')
      .select('id', { count: 'exact', head: true })
      .not('published_at', 'is', null);
    expect(count).toBe(1);

    // The whole point of D-060/this feature's contained blast radius:
    // getPublishedMenuView() has no database call at all, so a real
    // publish here cannot be reachable by a guest through it.
    const { getPublishedMenuView } = await import('../../src/modules/menu/menu-view');
    expect(getPublishedMenuView()).toEqual({ status: 'UNPUBLISHED' });
  });

  /**
   * `menu_import_draft` correctly treats a repeated import of *identical*
   * content as a no-op returning the *same* version (that is exactly what
   * "repeating the import with unchanged content is a no-op" above proves)
   * — so tests below that need their own fresh, independent DRAFT version
   * cannot get one by calling `importMenuDraft` again against the one real
   * `menu.json`. Each inserts its own synthetic `menu_versions` row with a
   * unique checksum instead, exercising the same approve/publish path
   * without depending on run order or re-triggering a real import.
   */
  const syntheticVersionNumbers: number[] = [];
  async function insertDraftVersion(): Promise<number> {
    const versionNumber =
      900000 + syntheticVersionNumbers.length + Math.floor(Math.random() * 90000);
    syntheticVersionNumbers.push(versionNumber);
    const { error } = await client.from('menu_versions').insert({
      version_number: versionNumber,
      source_checksum: randomBytes(24).toString('hex'),
    });
    if (error) throw new Error(`draft version fixture failed: ${error.message}`);
    return versionNumber;
  }

  async function getRowId(versionNumber: number): Promise<string> {
    const { data } = await client
      .from('menu_versions')
      .select('id')
      .eq('version_number', versionNumber)
      .single();
    return data?.id as string;
  }

  it('refuses to publish an already-published version a second time', async () => {
    const versionNumber = await insertDraftVersion();
    const approved = await approveMenuVersion(deps, ownerActor, versionNumber, 1, randomUUID());
    expect(approved.ok).toBe(true);
    const first = await publishMenuVersion(deps, ownerActor, versionNumber, randomUUID());
    expect(first.ok).toBe(true);

    const second = await publishMenuVersion(deps, ownerActor, versionNumber, randomUUID());
    expect(second.ok).toBe(false);
  });

  it('lets exactly one of many genuinely concurrent publish calls win, for the same version', async () => {
    const versionNumber = await insertDraftVersion();
    await approveMenuVersion(deps, ownerActor, versionNumber, 1, randomUUID());

    // Proves the FOR UPDATE fix in menu_publish_version: without it, two
    // concurrent calls could both read published_at IS NULL before either
    // writes and both "succeed."
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        publishMenuVersion(deps, ownerActor, versionNumber, randomUUID()),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('publishing a new version unpublishes and archives the previously published one', async () => {
    const firstVersion = await insertDraftVersion();
    await approveMenuVersion(deps, ownerActor, firstVersion, 1, randomUUID());
    const firstPublish = await publishMenuVersion(deps, ownerActor, firstVersion, randomUUID());
    expect(firstPublish.ok).toBe(true);

    const secondVersion = await insertDraftVersion();
    await approveMenuVersion(deps, ownerActor, secondVersion, 1, randomUUID());
    const secondPublish = await publishMenuVersion(deps, ownerActor, secondVersion, randomUUID());
    expect(secondPublish.ok).toBe(true);

    const { data: firstRow } = await client
      .from('menu_versions')
      .select('published_at')
      .eq('version_number', firstVersion)
      .single();
    expect(firstRow?.published_at).toBeNull();

    // Neither synthetic version has any menu_categories rows attached, so
    // this proves the version-level unpublish/supersede bookkeeping
    // (published_at cleared) rather than the row-transition step, which
    // the real-menu.json test above already covers.
    const { count } = await client
      .from('menu_versions')
      .select('id', { count: 'exact', head: true })
      .not('published_at', 'is', null);
    expect(count).toBe(1);
  });

  afterAll(async () => {
    for (const versionNumber of syntheticVersionNumbers) {
      await client.from('menu_versions').delete().eq('version_number', versionNumber);
    }
  });
});
