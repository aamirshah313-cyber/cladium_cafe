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
 * failures that say nothing about the code under test.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
