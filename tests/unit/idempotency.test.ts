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

  it('rejects a concurrent duplicate still IN_PROGRESS rather than running fn twice', async () => {
    const store = createInMemoryIdempotencyStore<{ id: string }>();
    await store.begin('session-1:submitTakeaway', 'key-1', 'fp-a', NOW());

    const result = await runIdempotent(
      store,
      { scope: 'session-1:submitTakeaway', key: 'key-1', fingerprint: 'fp-a', now: NOW },
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
});
