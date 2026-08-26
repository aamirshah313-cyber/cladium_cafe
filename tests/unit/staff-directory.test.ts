import { describe, expect, it } from 'vitest';
import { createDevStaffDirectory } from '../../src/modules/staff/directory';
import { verifyDevStaffCredentials } from '../../src/modules/staff/dev-credentials';
import type { StaffDevAccount } from '../../src/lib/env.server';

const ACCOUNTS: readonly StaffDevAccount[] = [
  { staffId: 'staff-1', displayName: 'Aamir', roles: ['OWNER'], devPassword: 'correct-horse-1' },
  {
    staffId: 'staff-2',
    displayName: 'Order Desk',
    roles: ['ORDER_STAFF'],
    devPassword: 'correct-horse-2',
  },
];

describe('createDevStaffDirectory', () => {
  it('finds a seeded account by staffId, without exposing its password', () => {
    const directory = createDevStaffDirectory(ACCOUNTS);
    return directory.findAccount('staff-1').then((account) => {
      expect(account).toEqual({ staffId: 'staff-1', displayName: 'Aamir', roles: ['OWNER'] });
      expect(account).not.toHaveProperty('devPassword');
    });
  });

  it('returns null for an unknown staffId', async () => {
    const directory = createDevStaffDirectory(ACCOUNTS);
    expect(await directory.findAccount('nobody')).toBeNull();
  });

  it('returns null for every lookup when the account list is empty — the production default', async () => {
    const directory = createDevStaffDirectory([]);
    expect(await directory.findAccount('staff-1')).toBeNull();
  });
});

describe('verifyDevStaffCredentials', () => {
  it('returns the staffId for a matching staffId/password pair', () => {
    expect(verifyDevStaffCredentials(ACCOUNTS, 'staff-1', 'correct-horse-1')).toBe('staff-1');
  });

  it('returns null for a wrong password', () => {
    expect(verifyDevStaffCredentials(ACCOUNTS, 'staff-1', 'wrong-password')).toBeNull();
  });

  it('returns null for an unknown staffId', () => {
    expect(verifyDevStaffCredentials(ACCOUNTS, 'nobody', 'correct-horse-1')).toBeNull();
  });

  it('never authenticates anything when the account list is empty', () => {
    expect(verifyDevStaffCredentials([], 'staff-1', 'correct-horse-1')).toBeNull();
  });

  it('rejects a password one character short of correct (no accidental prefix match)', () => {
    expect(verifyDevStaffCredentials(ACCOUNTS, 'staff-1', 'correct-horse-')).toBeNull();
  });
});
