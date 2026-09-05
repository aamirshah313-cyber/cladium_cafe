import { describe, expect, it } from 'vitest';
import { ok, err } from '../../src/lib/result';
import { internalError } from '../../src/lib/errors';
import { createInMemoryIdempotencyStore, runIdempotent } from '../../src/lib/domain/idempotency';

const NOW = () => new Date('2026-08-26T12:00:00Z');

describe('runIdempotent', () => {
  it('runs fn once and stores the result on first call', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    let calls = 0;
    const result = await runIdempotent(
      store,
      { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
      async () => {
        calls++;
        return ok({ id: 'order-1' });
      },
    );
    expect(result).toEqual(ok({ id: 'order-1' }));
    expect(calls).toBe(1);
  });

  it('replays the stored result for the same key and fingerprint without re-running fn', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    let calls = 0;
    const run = () =>
      runIdempotent(
        store,
        { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
        async () => {
          calls++;
          return ok({ id: 'order-1' });
        },
      );

    const first = await run();
    const second = await run();
    expect(first).toEqual(second);
    expect(calls).toBe(1);
  });

  it('rejects the same key reused with a different fingerprint', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    await runIdempotent(
      store,
      { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
      async () => ok({ id: 'order-1' }),
    );

    const result = await runIdempotent(
      store,
      { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-b', now: NOW },
      async () => ok({ id: 'order-2' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('scopes keys independently — the same key under a different scope does not collide', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    const a = await runIdempotent(
      store,
      { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
      async () => ok({ id: 'order-1' }),
    );
    const b = await runIdempotent(
      store,
      { scope: 'session-2:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
      async () => ok({ id: 'order-2' }),
    );
    expect(a).toEqual(ok({ id: 'order-1' }));
    expect(b).toEqual(ok({ id: 'order-2' }));
  });

  it('rejects a duplicate still IN_PROGRESS rather than running fn twice', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    await store.findOrBegin('session-1:submitTakeaway', 'key-1', 'fp-a', NOW());

    const result = await runIdempotent(
      store,
      { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
      async () => ok({ id: 'order-1' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('Step 21: two genuinely concurrent calls with the same key/fingerprint run fn exactly once', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    let calls = 0;
    const run = () =>
      runIdempotent(
        store,
        { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
        async () => {
          calls++;
          return ok({ id: 'order-1' });
        },
      );

    // Fired together (not awaited one at a time) — this is what actually
    // exercises the race the sequential tests above cannot reach.
    const [a, b] = await Promise.all([run(), run()]);

    expect(calls).toBe(1);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'IDEMPOTENCY_CONFLICT')).toHaveLength(1);
  });

  it('a FAILED record with a different fingerprint still blocks as a mismatch, not a free retry', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    await runIdempotent(
      store,
      { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
      async () => err(internalError()),
    );

    const result = await runIdempotent(
      store,
      { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-DIFFERENT', now: NOW },
      async () => ok({ id: 'order-1' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('allows a retry with the same key/fingerprint after a prior attempt failed', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    let calls = 0;
    const run = () =>
      runIdempotent(
        store,
        { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
        async () => {
          calls++;
          return calls === 1 ? err(internalError()) : ok({ id: 'order-1' });
        },
      );

    const first = await run();
    expect(first.ok).toBe(false);

    const second = await run();
    expect(second).toEqual(ok({ id: 'order-1' }));
    expect(calls).toBe(2);
  });

  it('marks the record FAILED and rethrows when fn() throws instead of returning err()', async () => {
    // The case a durable store makes dangerous: without this, the fresh
    // IN_PROGRESS record findOrBegin just wrote would never be resolved.
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    const boom = new Error('transient store failure');

    await expect(
      runIdempotent(
        store,
        { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
        async () => {
          throw boom;
        },
      ),
    ).rejects.toBe(boom);

    const record = store.records.get('session-1:submitTakeaway key-1');
    expect(record?.status).toBe('FAILED');
  });

  it('allows a retry with the same key/fingerprint after fn() threw', async () => {
    // Proves the FAILED mark actually unblocks the next attempt, not just
    // that it gets written.
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    let calls = 0;
    const run = () =>
      runIdempotent(
        store,
        { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
        async () => {
          calls += 1;
          if (calls === 1) throw new Error('transient store failure');
          return ok({ id: 'order-1' });
        },
      );

    await expect(run()).rejects.toThrow('transient store failure');

    const second = await run();
    expect(second).toEqual(ok({ id: 'order-1' }));
    expect(calls).toBe(2);
  });

  it('surfaces the original error, with cause, when store.fail() itself throws', async () => {
    // Neither error is silently lost: the original is not swallowed, and
    // the secondary failure is not hidden either.
    const original = new Error('fn failed');
    const failStore = {
      async findOrBegin() {
        return null;
      },
      async complete() {},
      async fail() {
        throw new Error('store.fail also failed');
      },
    };

    let caught: unknown;
    try {
      await runIdempotent(
        failStore,
        { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
        async () => {
          throw original;
        },
      );
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/store\.fail\(\) also threw/);
    expect((caught as Error).cause).toMatchObject({ thrown: original });
  });
});
