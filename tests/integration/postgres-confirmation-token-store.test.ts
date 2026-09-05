/**
 * Real-Postgres tests for `createPostgresConfirmationTokenStore`.
 *
 * These exist because the in-memory store cannot prove the two things
 * that actually matter about the adapter: that the row mapping matches
 * the real schema (constraints, enums, NOT NULLs, foreign keys included),
 * and that `claimIfUnused` is genuinely atomic under concurrency rather
 * than merely looking atomic in JavaScript. This project has repeatedly
 * found that sequential tests pass while the concurrent case is broken,
 * so the race is exercised explicitly with `Promise.all`.
 *
 * Skips with a clear message when the connection environment is absent,
 * so a run without a database reports "skipped" and never a false pass.
 * Setup is documented in `vitest.integration.config.ts`.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPostgresConfirmationTokenStore } from '../../src/lib/db/postgres-confirmation-token-store';
import type { ConfirmationTokenRecord } from '../../src/lib/domain/confirmation-token';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

// A 64-char hex string satisfies every `char_length(...) between 32 and 128`
// constraint these tables carry, so fixtures never fail on length rather
// than on the behaviour under test.
const hex = () => randomBytes(32).toString('hex');

describe.skipIf(!configured)('createPostgresConfirmationTokenStore (real Postgres)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = createPostgresConfirmationTokenStore(client);
  const sessionId = randomUUID();
  const createdSessionIds: string[] = [];

  function tokenRecord(overrides: Partial<ConfirmationTokenRecord> = {}): ConfirmationTokenRecord {
    const issuedAt = new Date('2026-09-04T10:00:00.000Z');
    return {
      tokenHash: hex(),
      sessionId,
      action: 'TAKEAWAY_REQUEST',
      reviewHash: hex(),
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 900_000).toISOString(),
      usedAt: null,
      ...overrides,
    };
  }

  beforeAll(async () => {
    // confirmation_tokens.session_id is NOT NULL with a real FK, so a
    // session row must exist first — a constraint the in-memory store has
    // no equivalent for, and exactly the kind of thing only a real
    // database surfaces.
    const { error } = await client.from('customer_sessions').insert({
      id: sessionId,
      token_hash: hex(),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    if (error) throw new Error(`session fixture failed: ${error.message}`);
    createdSessionIds.push(sessionId);
  });

  afterAll(async () => {
    // confirmation_tokens cascades from customer_sessions, so deleting the
    // session removes every token this file created.
    for (const id of createdSessionIds) {
      await client.from('customer_sessions').delete().eq('id', id);
    }
  });

  it('round-trips a saved record through find(), preserving every mapped field', async () => {
    const record = tokenRecord();
    await store.save(record);

    const found = await store.find(record.tokenHash);
    expect(found).not.toBeNull();
    expect(found).toEqual(record);
  });

  it('returns null for a token hash that was never saved', async () => {
    expect(await store.find(hex())).toBeNull();
  });

  it('claims an unused token once and reports its pre-use state', async () => {
    const record = tokenRecord();
    await store.save(record);

    const claimed = await store.claimIfUnused(record.tokenHash, new Date());
    expect(claimed).not.toBeNull();
    // Pre-use state: usedAt is null even though the row is now marked used.
    expect(claimed).toEqual(record);

    // The row really was marked used, not just reported that way.
    const after = await store.find(record.tokenHash);
    expect(after?.usedAt).not.toBeNull();
  });

  it('refuses a second claim on an already-used token', async () => {
    const record = tokenRecord();
    await store.save(record);

    expect(await store.claimIfUnused(record.tokenHash, new Date())).not.toBeNull();
    expect(await store.claimIfUnused(record.tokenHash, new Date())).toBeNull();
  });

  it('returns null when claiming a token that does not exist', async () => {
    expect(await store.claimIfUnused(hex(), new Date())).toBeNull();
  });

  it('lets exactly one of many genuinely concurrent claims win', async () => {
    const record = tokenRecord();
    await store.save(record);

    // The real double-click: not sequential awaits, which never interleave
    // and would pass even against a broken read-then-write implementation.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.claimIfUnused(record.tokenHash, new Date())),
    );

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(9);
  });

  it('creates its own customer_sessions row when none exists yet — the real guest-request path, not a test fixture (D-078)', async () => {
    // Every other test in this file relies on beforeAll's fixture session,
    // masking whether save() is actually self-sufficient. This is the exact
    // scenario that broke live on real staging: a session id with no
    // pre-existing customer_sessions row at all, exercised through the real
    // adapter, not a manually-inserted fixture.
    const freshSessionId = randomUUID();
    const record = tokenRecord({ sessionId: freshSessionId });
    await expect(store.save(record)).resolves.toBeUndefined();

    const found = await store.find(record.tokenHash);
    expect(found).toEqual(record);

    const { data: sessionRow } = await client
      .from('customer_sessions')
      .select('id')
      .eq('id', freshSessionId)
      .maybeSingle();
    expect(sessionRow).not.toBeNull();
    createdSessionIds.push(freshSessionId);
  });

  it('a second save for the same never-seen-before session still succeeds (the ensure-call is idempotent)', async () => {
    const freshSessionId = randomUUID();
    await store.save(tokenRecord({ sessionId: freshSessionId }));
    await expect(store.save(tokenRecord({ sessionId: freshSessionId }))).resolves.toBeUndefined();
    createdSessionIds.push(freshSessionId);
  });

  it('rejects a duplicate token hash rather than overwriting the original', async () => {
    const record = tokenRecord();
    await store.save(record);
    await expect(store.save(tokenRecord({ tokenHash: record.tokenHash }))).rejects.toThrow();
  });
});
