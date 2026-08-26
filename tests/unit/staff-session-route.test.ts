import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { issueStaffSessionCookie } from '../../src/lib/staff-session';
import { createCsrfToken } from '../../src/lib/security/csrf';
import { guardStaffMutation, resolveStaffActor } from '../../src/lib/http/staff-session-route';
import { createDevStaffDirectory } from '../../src/modules/staff/directory';

const SECRET = 'test-secret-value-at-least-32-bytes-long';
const APP_URL = 'https://cladium.example';
const FIXED_NOW = new Date('2026-08-27T12:00:00.000Z');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const directory = createDevStaffDirectory([
  { staffId: 'staff-1', displayName: 'Aamir', roles: ['OWNER'], devPassword: 'x'.repeat(12) },
]);

function cookieHeaderFor(staffId: string) {
  const cookie = issueStaffSessionCookie(staffId, SECRET, { secure: true, now: FIXED_NOW });
  return cookie.split(';')[0] as string;
}

describe('resolveStaffActor', () => {
  it('resolves a valid session for a known account', async () => {
    const result = await resolveStaffActor({
      headers: { cookie: cookieHeaderFor('staff-1') },
      secure: true,
      directory,
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.staffId).toBe('staff-1');
      expect(result.value.actor).toEqual({ type: 'STAFF', id: 'staff-1', roles: ['OWNER'] });
      expect(result.value.csrfToken).toBe(createCsrfToken('staff-1', SECRET));
    }
  });

  it('UNAUTHORIZED when there is no cookie at all — never auto-minted', async () => {
    const result = await resolveStaffActor({ headers: {}, secure: true, directory });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('UNAUTHORIZED for a valid signature but an account that no longer exists', async () => {
    const result = await resolveStaffActor({
      headers: { cookie: cookieHeaderFor('removed-staff-member') },
      secure: true,
      directory,
      now: FIXED_NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('fails closed when SESSION_SECRET is not configured', async () => {
    delete process.env.SESSION_SECRET;
    const result = await resolveStaffActor({ headers: {}, secure: true, directory });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL');
  });
});

describe('guardStaffMutation', () => {
  it('is a no-op for GET', () => {
    const result = guardStaffMutation({ method: 'GET', staffId: 'staff-1' });
    expect(result.ok).toBe(true);
  });

  it('accepts a trusted origin with a matching CSRF token', () => {
    const csrfToken = createCsrfToken('staff-1', SECRET);
    const result = guardStaffMutation({
      method: 'POST',
      origin: APP_URL,
      staffId: 'staff-1',
      csrfToken,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a missing origin', () => {
    const result = guardStaffMutation({ method: 'POST', staffId: 'staff-1', csrfToken: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('rejects a mismatched CSRF token', () => {
    const result = guardStaffMutation({
      method: 'POST',
      origin: APP_URL,
      staffId: 'staff-1',
      csrfToken: 'wrong-token',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  it('rejects a CSRF token minted for a different staffId', () => {
    const csrfToken = createCsrfToken('some-other-staff-id', SECRET);
    const result = guardStaffMutation({
      method: 'POST',
      origin: APP_URL,
      staffId: 'staff-1',
      csrfToken,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });
});
