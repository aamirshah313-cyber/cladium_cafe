import { defineConfig } from 'vitest/config';

/**
 * Unit tests only — deliberately scoped to `tests/unit` so `npm test`
 * (and therefore `npm run verify` and CI) never needs a live database.
 * Database-backed adapter tests live in `tests/integration` and run via
 * `npm run test:integration` with its own config. Every `.test.ts` in the
 * repo was already under `tests/unit`, so this narrowing changed no
 * file's behaviour at the time it was made.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    /*
     * This suite runs with no Supabase credentials by design (see above), so
     * the durable stores cannot be constructed. Since
     * `lib/db/durable-storage-policy.ts` now fails closed rather than
     * quietly degrading to memory, that has to be stated rather than
     * assumed — an unset variable means "stop", and only a test or a local
     * dev environment may opt back in. `tests/unit/durable-storage-policy.test.ts`
     * stubs the variable per-test in both directions, so setting it here
     * does not stop the fail-closed default itself from being covered.
     */
    env: { ALLOW_IN_MEMORY_STORES: 'true' },
  },
});
