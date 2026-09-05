/**
 * Real-Postgres tests for `createPostgresTakeawayRequestStore`.
 *
 * The interesting part is the `menuVersionNumber` (a number the domain
 * carries) to `menu_version_id` (a uuid foreign key) resolution, in both
 * directions — an embed on the way out, a lookup on the way in. Neither
 * can be checked without a real database and a real `menu_versions` row,
 * because the whole mechanism is referential.
 *
 * The generic compare-and-set machinery is already covered by the booking
 * store's tests, so this file concentrates on what is specific to takeaway
 * rather than repeating them.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPostgresTakeawayRequestStore } from '../../src/lib/db/postgres-takeaway-request-store';
import type { TakeawayRequestRecord } from '../../src/modules/takeaway/request';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

describe.skipIf(!configured)('createPostgresTakeawayRequestStore (real Postgres)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = createPostgresTakeawayRequestStore(client);

  // version_number is globally unique, so a fixed number would collide with
  // any real import and with a re-run against a non-reset database.
  const menuVersionNumber = 900000 + Math.floor(Math.random() * 90000);
  const sessionId = randomUUID();
  const createdIds: string[] = [];

  function record(overrides: Partial<TakeawayRequestRecord> = {}): TakeawayRequestRecord {
    const id = randomUUID();
    createdIds.push(id);
    return {
      id,
      version: 1,
      state: 'REQUESTED',
      guestName: 'Test Guest',
      guestPhone: '03001234567',
      menuVersionNumber,
      subtotalPkr: 1200,
      adjustmentsPkr: 0,
      totalPkr: 1200,
      requestedCollectionNote: 'Around 7pm',
      notes: null,
      sessionId,
      sourceChannel: 'WEB',
      assignedStaffId: null,
      createdAt: new Date('2026-09-04T10:00:00.000Z').toISOString(),
      ...overrides,
    };
  }

  beforeAll(async () => {
    const session = await client.from('customer_sessions').insert({
      id: sessionId,
      token_hash: randomBytes(32).toString('hex'),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    if (session.error) throw new Error(`session fixture failed: ${session.error.message}`);

    const menu = await client.from('menu_versions').insert({
      version_number: menuVersionNumber,
      source_checksum: randomBytes(24).toString('hex'),
    });
    if (menu.error) throw new Error(`menu version fixture failed: ${menu.error.message}`);
  });

  afterAll(async () => {
    // Order matters: menu_version_id is `on delete restrict`, so the
    // requests have to go before the menu version they point at.
    for (const id of createdIds) {
      await client.from('takeaway_requests').delete().eq('id', id);
    }
    await client.from('menu_versions').delete().eq('version_number', menuVersionNumber);
    await client.from('customer_sessions').delete().eq('id', sessionId);
  });

  it('resolves the menu version number to a foreign key on write, and back on read', async () => {
    const created = record();
    await store.create(created);

    const found = await store.find(created.id);
    expect(found).toEqual(created);

    // The column really holds the foreign key, not the number.
    const { data } = await client
      .from('takeaway_requests')
      .select('menu_version_id, menu_versions(version_number)')
      .eq('id', created.id)
      .single();
    expect(data?.menu_version_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data?.menu_versions).toEqual({ version_number: menuVersionNumber });
  });

  it('refuses to create a request against a menu version that does not exist', async () => {
    // Reported as a missing menu version rather than as a foreign-key
    // violation naming a column the caller never supplied.
    await expect(store.create(record({ menuVersionNumber: 999999 }))).rejects.toThrow(
      /no menu version/,
    );
  });

  it('refuses to patch the menu version a request was quoted from', async () => {
    const created = record();
    await store.create(created);

    await expect(
      store.updateIfVersionMatches(created.id, 1, { menuVersionNumber: menuVersionNumber + 1 }),
    ).rejects.toThrow(/cannot be patched/);
  });

  it('rejects a total that is not the sum of subtotal and adjustments', async () => {
    // takeaway_requests_total_is_sum: totals are arithmetic, not opinion.
    await expect(
      store.create(record({ subtotalPkr: 1000, adjustmentsPkr: 0, totalPkr: 1200 })),
    ).rejects.toThrow();
  });

  it('accepts a negative adjustment as a discount', async () => {
    const created = record({ subtotalPkr: 1000, adjustmentsPkr: -150, totalPkr: 850 });
    await store.create(created);

    const found = await store.find(created.id);
    expect(found?.adjustmentsPkr).toBe(-150);
    expect(found?.totalPkr).toBe(850);
  });

  it('updates on a matching version and lets the trigger bump it', async () => {
    const created = record();
    await store.create(created);

    const updated = await store.updateIfVersionMatches(created.id, 1, { state: 'ACCEPTED' });
    expect(updated?.state).toBe('ACCEPTED');
    expect(updated?.version).toBe(2);
    // The embed still resolves after an update, not only after a create.
    expect(updated?.menuVersionNumber).toBe(menuVersionNumber);
  });

  it('rejects an illegal state transition rather than returning null', async () => {
    const created = record();
    await store.create(created);

    // REQUESTED -> READY is not legal; only a version mismatch returns null.
    await expect(store.updateIfVersionMatches(created.id, 1, { state: 'READY' })).rejects.toThrow();
  });

  it('lists created requests with the menu version resolved, not N+1 or missing', async () => {
    const created = record();
    await store.create(created);

    const mine = (await store.list()).find((r) => r.id === created.id);
    expect(mine?.menuVersionNumber).toBe(menuVersionNumber);
  });

  it('creates its own customer_sessions row when none exists yet — the real guest-request path, not a test fixture (D-078)', async () => {
    // Every other test in this file relies on beforeAll's fixture session,
    // masking whether create() is actually self-sufficient. This is the
    // exact scenario that broke live on real staging.
    const freshSessionId = randomUUID();
    const created = record({ sessionId: freshSessionId });
    await expect(store.create(created)).resolves.toBeUndefined();

    const { data: sessionRow } = await client
      .from('customer_sessions')
      .select('id')
      .eq('id', freshSessionId)
      .maybeSingle();
    expect(sessionRow).not.toBeNull();
    await client.from('customer_sessions').delete().eq('id', freshSessionId);
  });
});
