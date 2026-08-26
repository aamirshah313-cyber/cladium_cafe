import { describe, expect, it } from 'vitest';
import { createInMemoryVersionedStore } from '../../src/lib/domain/versioned-store';

interface TestRecord {
  readonly id: string;
  readonly version: number;
  readonly state: string;
}

describe('createInMemoryVersionedStore', () => {
  it('creates and finds a record', async () => {
    const store = createInMemoryVersionedStore<TestRecord>();
    await store.create({ id: 'r1', version: 1, state: 'A' });
    expect(await store.find('r1')).toEqual({ id: 'r1', version: 1, state: 'A' });
  });

  it('returns null for an unknown id', async () => {
    const store = createInMemoryVersionedStore<TestRecord>();
    expect(await store.find('missing')).toBeNull();
  });

  it('updates and increments the version when the expected version matches', async () => {
    const store = createInMemoryVersionedStore<TestRecord>();
    await store.create({ id: 'r1', version: 1, state: 'A' });

    const updated = await store.updateIfVersionMatches('r1', 1, { state: 'B' });

    expect(updated).toEqual({ id: 'r1', version: 2, state: 'B' });
    expect(await store.find('r1')).toEqual({ id: 'r1', version: 2, state: 'B' });
  });

  it('returns null and leaves the record untouched on a version mismatch', async () => {
    const store = createInMemoryVersionedStore<TestRecord>();
    await store.create({ id: 'r1', version: 1, state: 'A' });

    const result = await store.updateIfVersionMatches('r1', 99, { state: 'B' });

    expect(result).toBeNull();
    expect(await store.find('r1')).toEqual({ id: 'r1', version: 1, state: 'A' });
  });

  it('returns null when updating a record that does not exist', async () => {
    const store = createInMemoryVersionedStore<TestRecord>();
    expect(await store.updateIfVersionMatches('missing', 1, { state: 'B' })).toBeNull();
  });

  it('a second update against the now-stale original version is rejected', async () => {
    const store = createInMemoryVersionedStore<TestRecord>();
    await store.create({ id: 'r1', version: 1, state: 'A' });
    await store.updateIfVersionMatches('r1', 1, { state: 'B' });

    // Simulates two concurrent readers who both saw version 1.
    const secondWriter = await store.updateIfVersionMatches('r1', 1, { state: 'C' });

    expect(secondWriter).toBeNull();
    expect((await store.find('r1'))?.state).toBe('B');
  });
});
