/**
 * Real-Postgres tests for `createPostgresIdempotencyStore`.
 *
 * This adapter carries far more risk than the confirmation-token one: its
 * table does not map 1:1 onto the domain record, `findOrBegin`'s whole
 * contract is atomicity under genuine concurrency, and the fingerprint it
 * receives is a raw secret that must never reach storage. Each of those is
 * tested directly rather than assumed.
 *
 * Skips with a clear message when the connection environment is absent, so
 * a run without a database reports "skipped" and never a false pass.
 */

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createPostgresIdempotencyStore } from '../../src/lib/db/postgres-idempotency-store';
import { runIdempotent } from '../../src/lib/domain/idempotency';
import { err, ok } from '../../src/lib/result';
import { internalError } from '../../src/lib/errors';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(url && serviceRoleKey);

interface SubmitResult {
  readonly requestId: string;
  readonly state: 'REQUESTED';
}

// The real callers' key/fingerprint shapes: an idempotency key is 16-128
// URL-safe chars, and a fingerprint is a raw confirmation token
// (randomBytes(32).base64url === 43 chars).
const idemKey = () => randomBytes(24).toString('base64url');
const rawToken = () => randomBytes(32).toString('base64url');
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

describe.skipIf(!configured)('createPostgresIdempotencyStore (real Postgres)', () => {
  const client = createClient(url ?? '', serviceRoleKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const operation = 'submit_takeaway_request';
  const store = createPostgresIdempotencyStore<SubmitResult>({
    client,
    operation,
    entityType: 'takeaway_request',
    toEntityId: (r) => r.requestId,
    fromEntityId: (id) => ({ requestId: id, state: 'REQUESTED' }),
    ttlSeconds: 900,
  });

  const scopes: string[] = [];
  const scope = () => {
    const s = `${randomUUID()}:submitTakeawayRequest`;
    scopes.push(s);
    return s;
  };

  beforeAll(async () => {
    // Nothing to seed: idempotency_keys.session_id is nullable, unlike
    // confirmation_tokens.session_id, so no session fixture is required.
    const { error } = await client.from('idempotency_keys').select('actor_key').limit(1);
    if (error) throw new Error(`idempotency_keys not reachable: ${error.message}`);
  });

  afterAll(async () => {
    for (const s of scopes) {
      await client.from('idempotency_keys').delete().eq('actor_key', s);
    }
  });

  it('returns null for a brand-new key, meaning "proceed"', async () => {
    expect(await store.findOrBegin(scope(), idemKey(), rawToken(), new Date())).toBeNull();
  });

  it('blocks a second call while the first is still IN_PROGRESS', async () => {
    const s = scope();
    const key = idemKey();
    const fingerprint = rawToken();

    expect(await store.findOrBegin(s, key, fingerprint, new Date())).toBeNull();

    const blocked = await store.findOrBegin(s, key, fingerprint, new Date());
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe('IN_PROGRESS');
    // Reports the caller's own raw fingerprint back, so runIdempotent's
    // equality check still recognises this as a matching replay.
    expect(blocked?.fingerprint).toBe(fingerprint);
  });

  it('never stores the raw fingerprint, only its hash', async () => {
    const s = scope();
    const key = idemKey();
    const fingerprint = rawToken();
    await store.findOrBegin(s, key, fingerprint, new Date());

    const { data } = await client
      .from('idempotency_keys')
      .select('request_fingerprint')
      .eq('actor_key', s)
      .single();

    // The whole point: a database read must not recover a live token.
    expect(data?.request_fingerprint).not.toBe(fingerprint);
    expect(data?.request_fingerprint).toBe(sha256(fingerprint));
  });

  it('reports a mismatched fingerprint as different, so reuse is a conflict', async () => {
    const s = scope();
    const key = idemKey();
    await store.findOrBegin(s, key, rawToken(), new Date());

    const other = rawToken();
    const blocked = await store.findOrBegin(s, key, other, new Date());
    expect(blocked).not.toBeNull();
    expect(blocked?.fingerprint).not.toBe(other);
  });

  it('replays a SUCCEEDED result instead of re-running', async () => {
    const s = scope();
    const key = idemKey();
    const fingerprint = rawToken();
    const requestId = randomUUID();

    await store.findOrBegin(s, key, fingerprint, new Date());
    await store.complete(s, key, { requestId, state: 'REQUESTED' }, new Date());

    const replay = await store.findOrBegin(s, key, fingerprint, new Date());
    expect(replay?.status).toBe('SUCCEEDED');
    expect(replay?.result).toEqual({ requestId, state: 'REQUESTED' });
  });

  it('re-arms a FAILED attempt when the fingerprint matches (a safe retry)', async () => {
    const s = scope();
    const key = idemKey();
    const fingerprint = rawToken();

    await store.findOrBegin(s, key, fingerprint, new Date());
    await store.fail(s, key, new Date());

    // Same fingerprint: allowed to proceed again.
    expect(await store.findOrBegin(s, key, fingerprint, new Date())).toBeNull();
  });

  it('still blocks a FAILED attempt when the fingerprint differs', async () => {
    const s = scope();
    const key = idemKey();

    await store.findOrBegin(s, key, rawToken(), new Date());
    await store.fail(s, key, new Date());

    const blocked = await store.findOrBegin(s, key, rawToken(), new Date());
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe('FAILED');
  });

  it('lets exactly one of many genuinely concurrent claims proceed', async () => {
    const s = scope();
    const key = idemKey();
    const fingerprint = rawToken();

    // The real double-click. Sequential awaits never interleave and would
    // pass even against a read-then-write implementation.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.findOrBegin(s, key, fingerprint, new Date())),
    );

    expect(results.filter((r) => r === null)).toHaveLength(1);
    expect(results.filter((r) => r !== null)).toHaveLength(9);
  });

  it('runs the real runIdempotent seam end to end, executing fn exactly once', async () => {
    const s = scope();
    const key = idemKey();
    const fingerprint = rawToken();
    const requestId = randomUUID();
    let calls = 0;

    const run = () =>
      runIdempotent<SubmitResult>(store, { scope: s, key, fingerprint }, async () => {
        calls += 1;
        return ok({ requestId, state: 'REQUESTED' as const });
      });

    const first = await run();
    expect(first.ok).toBe(true);

    const second = await run();
    expect(second.ok).toBe(true);
    expect(calls).toBe(1);
    if (second.ok) expect(second.value).toEqual({ requestId, state: 'REQUESTED' });
  });

  it('marks the record FAILED when the operation fails, allowing a later retry', async () => {
    const s = scope();
    const key = idemKey();
    const fingerprint = rawToken();

    const failed = await runIdempotent<SubmitResult>(
      store,
      { scope: s, key, fingerprint },
      async () => err(internalError()),
    );
    expect(failed.ok).toBe(false);

    let retried = false;
    const retry = await runIdempotent<SubmitResult>(
      store,
      { scope: s, key, fingerprint },
      async () => {
        retried = true;
        return ok({ requestId: randomUUID(), state: 'REQUESTED' as const });
      },
    );
    expect(retried).toBe(true);
    expect(retry.ok).toBe(true);
  });
});
