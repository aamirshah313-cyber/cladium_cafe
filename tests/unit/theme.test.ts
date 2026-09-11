import { describe, expect, it } from 'vitest';
import { isSupportedTheme, THEMES } from '../../src/lib/theme/theme';

describe('THEMES', () => {
  /**
   * Pinned deliberately. `THEMES` drives the switcher, the cookie and the
   * `customer_sessions.theme` check constraint, and only the first of those
   * follows automatically — so adding a theme should force a visit here,
   * and from here to `globals.css` and the migration that widens the
   * constraint.
   */
  it('is exactly the six supported themes', () => {
    expect(THEMES).toEqual(['day', 'night', 'peach', 'golden', 'terracotta', 'ember']);
  });
});

describe('isSupportedTheme', () => {
  it.each(THEMES)('accepts %s', (theme) => {
    expect(isSupportedTheme(theme)).toBe(true);
  });

  it('rejects an unsupported value', () => {
    expect(isSupportedTheme('dark')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isSupportedTheme(null)).toBe(false);
    expect(isSupportedTheme(undefined)).toBe(false);
    expect(isSupportedTheme(42)).toBe(false);
  });
});
