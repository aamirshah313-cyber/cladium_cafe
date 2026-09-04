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
  },
});
