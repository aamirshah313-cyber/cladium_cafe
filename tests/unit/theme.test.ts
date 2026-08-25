import { describe, expect, it } from 'vitest';
import { isSupportedTheme, THEMES } from '../../src/lib/theme/theme';

describe('THEMES', () => {
  it('is exactly day and night', () => {
    expect(THEMES).toEqual(['day', 'night']);
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
