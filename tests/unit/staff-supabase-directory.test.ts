import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSupabaseStaffDirectory,
  findStaffAccountByAuthUserId,
} from '../../src/modules/staff/supabase-directory';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// No live Supabase project exists in this test environment (or CI). What
// matters here is the fail-closed contract itself — every query resolves to
// `null` rather than throwing — since `modules/staff/deps.ts`'s composite
// directory relies on exactly this to fall through cleanly to the dev
// directory in every environment without real Supabase configured.
describe('createSupabaseStaffDirectory (unconfigured)', () => {
  it('findAccount resolves to null rather than throwing', async () => {
    const directory = createSupabaseStaffDirectory();
    await expect(directory.findAccount('any-id')).resolves.toBeNull();
  });
});

describe('findStaffAccountByAuthUserId (unconfigured)', () => {
  it('resolves to null rather than throwing', async () => {
    await expect(findStaffAccountByAuthUserId('any-user-id')).resolves.toBeNull();
  });
});
