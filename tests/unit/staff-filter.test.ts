import { describe, expect, it } from 'vitest';
import { matchesRequestFilter } from '../../src/modules/staff/filter';

const RECORD = { state: 'REQUESTED', guestName: 'Aamir Shah', guestPhone: '+923001234567' };

describe('matchesRequestFilter', () => {
  it('matches everything when no filter is given', () => {
    expect(matchesRequestFilter(RECORD, {})).toBe(true);
  });

  it('filters by exact state', () => {
    expect(matchesRequestFilter(RECORD, { state: 'REQUESTED' })).toBe(true);
    expect(matchesRequestFilter(RECORD, { state: 'CANCELLED' })).toBe(false);
  });

  it('matches a case-insensitive substring of the guest name', () => {
    expect(matchesRequestFilter(RECORD, { search: 'aamir' })).toBe(true);
    expect(matchesRequestFilter(RECORD, { search: 'SHAH' })).toBe(true);
  });

  it('matches a substring of the guest phone', () => {
    expect(matchesRequestFilter(RECORD, { search: '3001234' })).toBe(true);
  });

  it('rejects a search term matching neither field', () => {
    expect(matchesRequestFilter(RECORD, { search: 'nobody' })).toBe(false);
  });

  it('combines state and search — both must match', () => {
    expect(matchesRequestFilter(RECORD, { state: 'REQUESTED', search: 'aamir' })).toBe(true);
    expect(matchesRequestFilter(RECORD, { state: 'CANCELLED', search: 'aamir' })).toBe(false);
  });

  it('treats a blank search as no filter', () => {
    expect(matchesRequestFilter(RECORD, { search: '   ' })).toBe(true);
  });
});
