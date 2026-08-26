/**
 * Optimistic-concurrency record store — Runbook Step 19.
 *
 * data-model-v2.md §1: "User-facing records include ... integer `version`
 * for optimistic concurrency," and §7's staff-transition contract: "lock
 * the record and compare expected version." `updateIfVersionMatches`
 * returns `null` on a version mismatch instead of throwing — a normal,
 * expected outcome (someone else changed the record first), not an
 * exceptional one.
 */

export interface VersionedRecord {
  readonly id: string;
  readonly version: number;
}

export interface VersionedStore<T extends VersionedRecord> {
  find(id: string): Promise<T | null>;
  create(record: T): Promise<void>;
  /** `null` when `expectedVersion` no longer matches the stored version. */
  updateIfVersionMatches(
    id: string,
    expectedVersion: number,
    patch: Partial<Omit<T, 'id' | 'version'>>,
  ): Promise<T | null>;
}

export function createInMemoryVersionedStore<T extends VersionedRecord>(): VersionedStore<T> & {
  readonly records: ReadonlyMap<string, T>;
} {
  const records = new Map<string, T>();
  return {
    records,
    async find(id) {
      return records.get(id) ?? null;
    },
    async create(record) {
      records.set(record.id, record);
    },
    async updateIfVersionMatches(id, expectedVersion, patch) {
      const existing = records.get(id);
      if (!existing || existing.version !== expectedVersion) return null;
      const updated: T = { ...existing, ...patch, version: existing.version + 1 };
      records.set(id, updated);
      return updated;
    },
  };
}
