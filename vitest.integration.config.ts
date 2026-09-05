import { defineConfig } from 'vitest/config';

/**
 * Integration tests — these talk to a real Postgres and are therefore
 * kept out of `npm test`/`npm run verify`/CI, which must stay runnable
 * with no database. Run them deliberately:
 *
 *   npx supabase start -x realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,mailpit
 *   npm run test:integration
 *
 * The lean service list is not arbitrary — see D-063: the excluded
 * containers do not become ready on a machine with ~3.8 GB available to
 * Docker. Each test file skips itself with an explicit message when the
 * connection environment variables are absent, so running this without a
 * database reports "skipped", never a false pass.
 *
 * `fileParallelism` is off because these tests share one database; two
 * files inserting into the same tables concurrently would produce
 * failures that say nothing about the code under test. `fileParallelism`
 * alone was not enough on its own: with the default pool, one 8-file run
 * genuinely produced a `postgres-outbox-store.test.ts` failure that
 * reproduced consistently across the full suite yet never in isolation or
 * in smaller subsets — evidence of real cross-file overlap despite the
 * setting, not the SQL under test (`outbox_claim_batch` was re-verified
 * correct standalone, claiming exactly its requested limit). Forcing a
 * single fork closes that gap explicitly rather than hoping
 * `fileParallelism` alone is sufficient.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    // `poolOptions.forks.singleFork` was removed in Vitest 4, not moved —
    // confirmed against this version's own shipped type declarations
    // (`node_modules/vitest/dist/chunks/config.*.d.ts` has no
    // `poolOptions` anywhere), not assumed from the deprecation warning's
    // wording, which first led to a config that type-checked as an error
    // and was silently ignored at runtime either way. `maxWorkers: 1` is
    // the real, typed replacement for pinning execution to one worker.
    maxWorkers: 1,
    testTimeout: 20_000,
  },
});
