/**
 * Real-Postgres tests for `createPostgresEventRequestStore`.
 *
 * The generic compare-and-set machinery is already covered by the booking
 * store's tests, so this file concentrates on what is specific to events:
 * the `occasion`/`decorInterest` renames, and the deliberate refusal to
 * write a non-null `quotedAmountPkr`.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPostgresEventRequestStore } from '../../src/lib/db/postgres-event-request-store';
import type { EventRequestRecord } from '../../src/modules/events/request';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

describe.skipIf(!configured)('createPostgresEventRequestStore (real Postgres)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = createPostgresEventRequestStore(client);
  const createdIds: string[] = [];
  const sessionId = randomUUID();

  function record(overrides: Partial<EventRequestRecord> = {}): EventRequestRecord {
    const id = randomUUID();
    createdIds.push(id);
    return {
      id,
      version: 1,
      state: 'ENQUIRY',
      guestName: 'Test Guest',
      guestPhone: '03001234567',
      occasion: 'Birthday',
      requestedDate: '2026-09-10',
      requestedTime: '19:00',
      guestCount: 12,
      decorInterest: true,
      notes: null,
      quotedAmountPkr: null,
      sessionId,
      sourceChannel: 'WEB',
      assignedStaffId: null,
      createdAt: new Date('2026-09-04T10:00:00.000Z').toISOString(),
      ...overrides,
    };
  }

  beforeAll(async () => {
    const { error } = await client.from('customer_sessions').insert({
      id: sessionId,
      token_hash: randomBytes(32).toString('hex'),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    if (error) throw new Error(`session fixture failed: ${error.message}`);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await client.from('event_requests').delete().eq('id', id);
    }
    await client.from('customer_sessions').delete().eq('id', sessionId);
  });

  it('round-trips a created record, renames included', async () => {
    const created = record();
    await store.create(created);

    const found = await store.find(created.id);
    // occasion/event_type and decorInterest/decor_requested are the pair
    // most likely to be mapped backwards without noticing.
    expect(found).toEqual(created);
  });

  it('stores event_type/decor_requested under the real column names', async () => {
    const created = record({ occasion: 'Anniversary', decorInterest: false });
    await store.create(created);

    const { data } = await client
      .from('event_requests')
      .select('event_type, decor_requested')
      .eq('id', created.id)
      .single();
    expect(data?.event_type).toBe('Anniversary');
    expect(data?.decor_requested).toBe(false);
  });

  it('stores the requested time as an Abbottabad wall clock, not as UTC', async () => {
    const created = record({ requestedDate: '2026-09-10', requestedTime: '19:00' });
    await store.create(created);

    const { data } = await client
      .from('event_requests')
      .select('requested_at')
      .eq('id', created.id)
      .single();
    expect(new Date(data?.requested_at as string).toISOString()).toBe('2026-09-10T14:00:00.000Z');
  });

  it('refuses to create a request with a non-null quotedAmountPkr', async () => {
    // The schema requires quoted_by/quoted_at whenever quoted_amount_pkr is
    // set, and EventRequestRecord carries neither field yet.
    await expect(store.create(record({ quotedAmountPkr: 15000 }))).rejects.toThrow(
      /quotedAmountPkr/,
    );
  });

  it('refuses to patch in a non-null quotedAmountPkr', async () => {
    const created = record();
    await store.create(created);

    await expect(
      store.updateIfVersionMatches(created.id, 1, { quotedAmountPkr: 15000 }),
    ).rejects.toThrow(/quotedAmountPkr/);
  });

  it('allows patching quotedAmountPkr to null, which needs no attribution', async () => {
    const created = record();
    await store.create(created);

    const updated = await store.updateIfVersionMatches(created.id, 1, { quotedAmountPkr: null });
    expect(updated).not.toBeNull();
    expect(updated?.quotedAmountPkr).toBeNull();
  });

  it('reads back a real quote written outside this adapter', async () => {
    // Confirms reads stay honest about quotes this store cannot itself
    // write — e.g. a future staff service, or direct SQL.
    // staff_profiles.user_id has a real FK into auth.users, so the fixture
    // goes through the GoTrue admin API (auth.admin.createUser) rather than
    // a raw insert, the same route a genuine staff account is provisioned
    // through.
    const created = record();
    await store.create(created);

    const { data: authUser, error: authError } = await client.auth.admin.createUser({
      email: `quote-fixture-${randomUUID()}@example.invalid`,
      email_confirm: true,
    });
    if (authError || !authUser.user) {
      throw new Error(`auth user fixture failed: ${authError?.message}`);
    }
    const staffId = randomUUID();
    await client
      .from('staff_profiles')
      .insert({ id: staffId, user_id: authUser.user.id, display_name: 'Quoting Staff' });

    await client
      .from('event_requests')
      .update({
        quoted_amount_pkr: 20000,
        quoted_by: staffId,
        quoted_at: new Date().toISOString(),
      })
      .eq('id', created.id);

    const found = await store.find(created.id);
    expect(found?.quotedAmountPkr).toBe(20000);

    await client.from('staff_profiles').delete().eq('id', staffId);
    await client.auth.admin.deleteUser(authUser.user.id);
  });

  it('updates on a matching version and lets the trigger bump it', async () => {
    const created = record();
    await store.create(created);

    const updated = await store.updateIfVersionMatches(created.id, 1, { state: 'REQUESTED' });
    expect(updated?.state).toBe('REQUESTED');
    expect(updated?.version).toBe(2);
  });

  it('rejects an illegal state transition rather than returning null', async () => {
    const created = record();
    await store.create(created);

    // ENQUIRY -> CONFIRMED is not legal; only a version mismatch returns null.
    await expect(
      store.updateIfVersionMatches(created.id, 1, { state: 'CONFIRMED' }),
    ).rejects.toThrow();
  });

  it('refuses to patch requestedDate without requestedTime', async () => {
    const created = record();
    await store.create(created);

    await expect(
      store.updateIfVersionMatches(created.id, 1, { requestedDate: '2026-09-11' }),
    ).rejects.toThrow(/must be patched together/);
  });

  it('lists created events with occasion resolved correctly', async () => {
    const created = record({ occasion: 'Graduation Party' });
    await store.create(created);

    const mine = (await store.list()).find((r) => r.id === created.id);
    expect(mine?.occasion).toBe('Graduation Party');
  });
});
