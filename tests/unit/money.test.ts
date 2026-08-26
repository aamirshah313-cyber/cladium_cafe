import { describe, expect, it } from 'vitest';
import { formatPkr } from '../../src/lib/business/money';

describe('formatPkr', () => {
  it('formats with the PKR prefix and thousands separators', () => {
    expect(formatPkr(8000)).toBe('PKR 8,000');
    expect(formatPkr(1234567)).toBe('PKR 1,234,567');
  });

  it('formats a small amount with no separator', () => {
    expect(formatPkr(450)).toBe('PKR 450');
  });

  it('formats zero', () => {
    expect(formatPkr(0)).toBe('PKR 0');
  });
});
