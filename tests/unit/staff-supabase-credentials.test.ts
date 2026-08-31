import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  StaffAssuranceLevel,
  StaffAuthClient,
  StaffAuthSession,
} from '../../src/modules/integrations/supabase-auth-client';
import type { StaffAccount } from '../../src/modules/staff/directory';
import { resolvePendingMfaState } from '../../src/modules/staff/mfa-session';
import {
  completeSupabaseMfaChallenge,
  completeTotpEnrollment,
  signInWithSupabasePassword,
  startTotpEnrollment,
  type SupabaseCredentialDeps,
} from '../../src/modules/staff/supabase-credentials';

const SECRET = 'test-secret-value-at-least-32-bytes-long';
const FIXED_NOW = new Date('2026-08-31T12:00:00.000Z');
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

const SESSION: StaffAuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  userId: 'auth-user-1',
};
const OWNER_ACCOUNT: StaffAccount = {
  staffId: 'profile-1',
  displayName: 'Aamir',
  roles: ['OWNER'],
};
const ORDER_STAFF_ACCOUNT: StaffAccount = {
  staffId: 'profile-2',
  displayName: 'Order Desk',
  roles: ['ORDER_STAFF'],
};

/** Every field defaults to "the happy path with no MFA factor yet" — each test overrides only what it needs. */
function fakeAuthClient(overrides: Partial<StaffAuthClient> = {}): StaffAuthClient {
  return {
    signInWithPassword: vi.fn(async () => SESSION),
    getAssuranceLevel: vi.fn(async () => ({ currentLevel: null, nextLevel: null })),
    findVerifiedTotpFactor: vi.fn(async () => null),
    challengeTotp: vi.fn(async () => null),
    verifyTotp: vi.fn(async () => null),
    enrollTotp: vi.fn(async () => null),
    verifyEnrollment: vi.fn(async () => null),
    ...overrides,
  };
}

function depsFor(
  authClient: StaffAuthClient,
  account: StaffAccount | null = ORDER_STAFF_ACCOUNT,
): SupabaseCredentialDeps {
  return { authClient, findAccountByAuthUserId: vi.fn(async () => account) };
}

describe('signInWithSupabasePassword', () => {
  it('FAILED when Supabase rejects the password', async () => {
    const authClient = fakeAuthClient({ signInWithPassword: vi.fn(async () => null) });
    const outcome = await signInWithSupabasePassword(depsFor(authClient), 'a@b.com', 'wrong', {
      secure: true,
      now: FIXED_NOW,
    });
    expect(outcome).toEqual({ kind: 'FAILED' });
  });

  it('FAILED when the authenticated user has no staff profile', async () => {
    const authClient = fakeAuthClient();
    const outcome = await signInWithSupabasePassword(depsFor(authClient, null), 'a@b.com', 'x', {
      secure: true,
      now: FIXED_NOW,
    });
    expect(outcome).toEqual({ kind: 'FAILED' });
  });

  it('SIGNED_IN directly for a non-owner/manager role with no MFA factor', async () => {
    const authClient = fakeAuthClient();
    const outcome = await signInWithSupabasePassword(
      depsFor(authClient, ORDER_STAFF_ACCOUNT),
      'a@b.com',
      'x',
      { secure: true, now: FIXED_NOW },
    );
    expect(outcome).toEqual({ kind: 'SIGNED_IN', account: ORDER_STAFF_ACCOUNT });
  });

  it("MFA_ENROLLMENT_REQUIRED for an OWNER account with no MFA factor — Gate 3 enforced regardless of what Supabase's nextLevel says", async () => {
    const authClient = fakeAuthClient();
    const outcome = await signInWithSupabasePassword(
      depsFor(authClient, OWNER_ACCOUNT),
      'a@b.com',
      'x',
      {
        secure: true,
        now: FIXED_NOW,
      },
    );
    expect(outcome.kind).toBe('MFA_ENROLLMENT_REQUIRED');
    if (outcome.kind !== 'MFA_ENROLLMENT_REQUIRED') return;
    const cookieHeader = outcome.pendingMfaCookie.split(';')[0] as string;
    const pending = resolvePendingMfaState(
      { cookie: cookieHeader },
      { secure: true, now: FIXED_NOW },
    );
    expect(pending).toEqual({
      purpose: 'ENROLL_WINDOW',
      session: SESSION,
      factorId: undefined,
      challengeId: undefined,
    });
  });

  it('MFA_ENROLLMENT_REQUIRED also applies to MANAGER', async () => {
    const authClient = fakeAuthClient();
    const managerAccount: StaffAccount = { ...OWNER_ACCOUNT, roles: ['MANAGER'] };
    const outcome = await signInWithSupabasePassword(
      depsFor(authClient, managerAccount),
      'a@b.com',
      'x',
      {
        secure: true,
        now: FIXED_NOW,
      },
    );
    expect(outcome.kind).toBe('MFA_ENROLLMENT_REQUIRED');
  });

  it('MFA_REQUIRED when a verified factor exists, regardless of role — challenges it', async () => {
    const authClient = fakeAuthClient({
      getAssuranceLevel: vi.fn(async (): Promise<StaffAssuranceLevel> => ({
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      })),
      findVerifiedTotpFactor: vi.fn(async () => ({ factorId: 'factor-1' })),
      challengeTotp: vi.fn(async () => ({ challengeId: 'challenge-1' })),
    });
    const outcome = await signInWithSupabasePassword(
      depsFor(authClient, ORDER_STAFF_ACCOUNT),
      'a@b.com',
      'x',
      { secure: true, now: FIXED_NOW },
    );
    expect(outcome.kind).toBe('MFA_REQUIRED');
    if (outcome.kind !== 'MFA_REQUIRED') return;
    const cookieHeader = outcome.pendingMfaCookie.split(';')[0] as string;
    const pending = resolvePendingMfaState(
      { cookie: cookieHeader },
      { secure: true, now: FIXED_NOW },
    );
    expect(pending).toEqual({
      purpose: 'SIGN_IN_CHALLENGE',
      session: SESSION,
      factorId: 'factor-1',
      challengeId: 'challenge-1',
    });
  });

  it('FAILED when nextLevel says aal2 but no verified factor is actually found (defensive)', async () => {
    const authClient = fakeAuthClient({
      getAssuranceLevel: vi.fn(async (): Promise<StaffAssuranceLevel> => ({
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      })),
      findVerifiedTotpFactor: vi.fn(async () => null),
    });
    const outcome = await signInWithSupabasePassword(
      depsFor(authClient, ORDER_STAFF_ACCOUNT),
      'a@b.com',
      'x',
      { secure: true, now: FIXED_NOW },
    );
    expect(outcome).toEqual({ kind: 'FAILED' });
  });

  it('SIGNED_IN when the session already reports aal2 (defensive)', async () => {
    const authClient = fakeAuthClient({
      getAssuranceLevel: vi.fn(async (): Promise<StaffAssuranceLevel> => ({
        currentLevel: 'aal2',
        nextLevel: 'aal2',
      })),
    });
    const outcome = await signInWithSupabasePassword(
      depsFor(authClient, OWNER_ACCOUNT),
      'a@b.com',
      'x',
      {
        secure: true,
        now: FIXED_NOW,
      },
    );
    expect(outcome).toEqual({ kind: 'SIGNED_IN', account: OWNER_ACCOUNT });
  });
});

describe('completeSupabaseMfaChallenge', () => {
  const pending = {
    purpose: 'SIGN_IN_CHALLENGE' as const,
    session: SESSION,
    factorId: 'factor-1',
    challengeId: 'challenge-1',
  };

  it('null for the wrong pending purpose (e.g. an ENROLL_WINDOW state)', async () => {
    const authClient = fakeAuthClient();
    const result = await completeSupabaseMfaChallenge(
      depsFor(authClient),
      { purpose: 'ENROLL_WINDOW', session: SESSION },
      '123456',
    );
    expect(result).toBeNull();
  });

  it('null for a wrong code', async () => {
    const authClient = fakeAuthClient({ verifyTotp: vi.fn(async () => null) });
    const result = await completeSupabaseMfaChallenge(depsFor(authClient), pending, '000000');
    expect(result).toBeNull();
  });

  it('signs in on a correct code, looking up the account via the elevated session', async () => {
    const elevated: StaffAuthSession = { ...SESSION, accessToken: 'elevated-access' };
    const authClient = fakeAuthClient({ verifyTotp: vi.fn(async () => elevated) });
    const deps = depsFor(authClient, OWNER_ACCOUNT);
    const result = await completeSupabaseMfaChallenge(deps, pending, '123456');
    expect(result).toEqual({ account: OWNER_ACCOUNT });
    expect(deps.findAccountByAuthUserId).toHaveBeenCalledWith(elevated.userId);
  });

  it('null when the elevated session no longer maps to a staff account', async () => {
    const authClient = fakeAuthClient({ verifyTotp: vi.fn(async () => SESSION) });
    const result = await completeSupabaseMfaChallenge(depsFor(authClient, null), pending, '123456');
    expect(result).toBeNull();
  });
});

describe('startTotpEnrollment', () => {
  it('null for the wrong pending purpose', async () => {
    const authClient = fakeAuthClient();
    const result = await startTotpEnrollment(
      depsFor(authClient),
      { purpose: 'SIGN_IN_CHALLENGE', session: SESSION, factorId: 'x', challengeId: 'y' },
      { secure: true, now: FIXED_NOW },
    );
    expect(result).toBeNull();
  });

  it('starts enrollment and re-issues the pending cookie with the factorId embedded', async () => {
    const authClient = fakeAuthClient({
      enrollTotp: vi.fn(async () => ({
        factorId: 'factor-new',
        qrCodeDataUri: 'data:image/svg+xml;utf-8,<svg/>',
        secret: 'SECRET123',
      })),
    });
    const result = await startTotpEnrollment(
      depsFor(authClient),
      { purpose: 'ENROLL_WINDOW', session: SESSION },
      { secure: true, now: FIXED_NOW },
    );
    expect(result).not.toBeNull();
    expect(result?.factorId).toBe('factor-new');
    expect(result?.secret).toBe('SECRET123');

    const cookieHeader = (result?.pendingMfaCookie ?? '').split(';')[0] as string;
    const pending = resolvePendingMfaState(
      { cookie: cookieHeader },
      { secure: true, now: FIXED_NOW },
    );
    expect(pending).toEqual({
      purpose: 'ENROLL_WINDOW',
      session: SESSION,
      factorId: 'factor-new',
      challengeId: undefined,
    });
  });
});

describe('completeTotpEnrollment', () => {
  it('null for the wrong pending purpose', async () => {
    const authClient = fakeAuthClient();
    const result = await completeTotpEnrollment(
      depsFor(authClient),
      { purpose: 'SIGN_IN_CHALLENGE', session: SESSION, factorId: 'x', challengeId: 'y' },
      '123456',
    );
    expect(result).toBeNull();
  });

  it('null when the pending state has no factorId (never started enrollment)', async () => {
    const authClient = fakeAuthClient();
    const result = await completeTotpEnrollment(
      depsFor(authClient),
      { purpose: 'ENROLL_WINDOW', session: SESSION },
      '123456',
    );
    expect(result).toBeNull();
  });

  it('null for a wrong code', async () => {
    const authClient = fakeAuthClient({ verifyEnrollment: vi.fn(async () => null) });
    const result = await completeTotpEnrollment(
      depsFor(authClient),
      { purpose: 'ENROLL_WINDOW', session: SESSION, factorId: 'factor-new' },
      '000000',
    );
    expect(result).toBeNull();
  });

  it('signs in on a correct code', async () => {
    const elevated: StaffAuthSession = { ...SESSION, accessToken: 'elevated-access' };
    const authClient = fakeAuthClient({ verifyEnrollment: vi.fn(async () => elevated) });
    const deps = depsFor(authClient, OWNER_ACCOUNT);
    const result = await completeTotpEnrollment(
      deps,
      { purpose: 'ENROLL_WINDOW', session: SESSION, factorId: 'factor-new' },
      '123456',
    );
    expect(result).toEqual({ account: OWNER_ACCOUNT });
    expect(authClient.verifyEnrollment).toHaveBeenCalledWith(SESSION, 'factor-new', '123456');
  });
});
