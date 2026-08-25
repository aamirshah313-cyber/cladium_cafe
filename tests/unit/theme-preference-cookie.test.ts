import { describe, expect, it } from 'vitest';
import { serializeThemeCookie, THEME_COOKIE_NAME } from '../../src/lib/theme/preference-cookie';

describe('serializeThemeCookie', () => {
  it('serializes a secure cookie with hardened, non-HttpOnly attributes', () => {
    const header = serializeThemeCookie('night');
    expect(header).toContain(`${THEME_COOKIE_NAME}=night`);
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    // Deliberately not HttpOnly: client JS must read/write this cookie.
    expect(header).not.toContain('HttpOnly');
  });

  it('omits Secure for insecure (local development) cookies', () => {
    const header = serializeThemeCookie('day', { secure: false });
    expect(header).not.toContain('Secure');
  });

  it('honours a custom max age', () => {
    const header = serializeThemeCookie('day', { maxAgeSeconds: 60 });
    expect(header).toContain('Max-Age=60');
  });
});
