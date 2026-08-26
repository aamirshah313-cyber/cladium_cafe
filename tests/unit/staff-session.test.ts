import { describe, expect, it } from 'vitest';
import {
  clearStaffSessionCookie,
  issueStaffSessionCookie,
  readStaffSessionToken,
  resolveStaffSession,
} from '../../src/lib/staff-session';
import { readSessionToken } from '../../src/lib/security/session';

const SECRET = 'x'.repeat(32);
const FIXED_NOW = new Date('2026-08-27T12:00:00.000Z');

describe('issueStaffSessionCookie', () => {
  it('uses a distinct cookie name from the guest session', () => {
    const cookie = issueStaffSessionCookie('staff-1', SECRET, { secure: true, now: FIXED_NOW });
    expect(cookie).toContain('__Host-cladium_staff_session=');
    expect(cookie).not.toContain('__Host-cladium_session=');
  });

  it("sets a 12-hour Max-Age, not the guest session's 7-day one", () => {
    const cookie = issueStaffSessionCookie('staff-1', SECRET, { secure: true, now: FIXED_NOW });
    expect(cookie).toContain(`Max-Age=${60 * 60 * 12}`);
  });

  it('the resulting token round-trips through resolveStaffSession', () => {
    const cookie = issueStaffSessionCookie('staff-1', SECRET, { secure: true, now: FIXED_NOW });
    const token = readStaffSessionToken({ cookie }, { secure: true });
    expect(resolveStaffSession(token, SECRET, { now: FIXED_NOW })).toEqual({ staffId: 'staff-1' });
  });
});

describe('resolveStaffSession', () => {
  it('returns null for an undefined token — never auto-mints', () => {
    expect(resolveStaffSession(undefined, SECRET, { now: FIXED_NOW })).toBeNull();
  });

  it('returns null for a forged/bad-signature token', () => {
    const cookie = issueStaffSessionCookie('staff-1', SECRET, { secure: true, now: FIXED_NOW });
    const token = readStaffSessionToken({ cookie }, { secure: true });
    expect(resolveStaffSession(token, 'y'.repeat(32), { now: FIXED_NOW })).toBeNull();
  });

  it('returns null for an expired token', () => {
    const cookie = issueStaffSessionCookie('staff-1', SECRET, { secure: true, now: FIXED_NOW });
    const token = readStaffSessionToken({ cookie }, { secure: true });
    const later = new Date(FIXED_NOW.getTime() + 60 * 60 * 13 * 1000); // 13h later, past the 12h TTL
    expect(resolveStaffSession(token, SECRET, { now: later })).toBeNull();
  });
});

describe('readStaffSessionToken', () => {
  it('does not read the guest session cookie under the staff cookie reader', () => {
    const guestCookie = 'irrelevant-guest-token';
    const headers = { cookie: `cladium_session=${guestCookie}` };
    expect(readStaffSessionToken(headers, { secure: false })).toBeUndefined();
  });

  it('reads only the staff cookie even when a guest cookie is also present', () => {
    const cookie = issueStaffSessionCookie('staff-1', SECRET, { secure: false, now: FIXED_NOW });
    const staffCookiePair = cookie.split(';')[0];
    const headers = { cookie: `cladium_session=guest-token; ${staffCookiePair}` };
    const token = readStaffSessionToken(headers, { secure: false });
    expect(resolveStaffSession(token, SECRET, { now: FIXED_NOW })).toEqual({ staffId: 'staff-1' });
    // And the guest reader on the same header never picks up the staff cookie's value.
    expect(readSessionToken(headers, { secure: false })).toBe('guest-token');
  });
});

describe('clearStaffSessionCookie', () => {
  it('clears the staff cookie with Max-Age=0', () => {
    const cookie = clearStaffSessionCookie({ secure: true });
    expect(cookie).toContain('__Host-cladium_staff_session=');
    expect(cookie).toContain('Max-Age=0');
  });
});
