import { describe, expect, it } from 'vitest';
import { CAFE_TIMEZONE, isOpenAt } from '../../src/lib/business/hours';

describe('isOpenAt', () => {
  it('is Asia/Karachi', () => {
    expect(CAFE_TIMEZONE).toBe('Asia/Karachi');
  });

  it('is closed just before noon local time', () => {
    // 2026-08-25T06:59:00Z = 11:59 PKT (UTC+5)
    expect(isOpenAt(new Date('2026-08-25T06:59:00Z'))).toBe(false);
  });

  it('is open exactly at noon local time', () => {
    // 2026-08-25T07:00:00Z = 12:00 PKT
    expect(isOpenAt(new Date('2026-08-25T07:00:00Z'))).toBe(true);
  });

  it('is open in the evening local time', () => {
    // 2026-08-25T15:00:00Z = 20:00 PKT
    expect(isOpenAt(new Date('2026-08-25T15:00:00Z'))).toBe(true);
  });

  it('is open one minute before local midnight', () => {
    // 2026-08-25T18:59:00Z = 23:59 PKT
    expect(isOpenAt(new Date('2026-08-25T18:59:00Z'))).toBe(true);
  });

  it('is closed exactly at local midnight', () => {
    // 2026-08-25T19:00:00Z = 00:00 PKT the next day
    expect(isOpenAt(new Date('2026-08-25T19:00:00Z'))).toBe(false);
  });

  it('is closed mid-morning local time', () => {
    // 2026-08-25T04:00:00Z = 09:00 PKT
    expect(isOpenAt(new Date('2026-08-25T04:00:00Z'))).toBe(false);
  });

  it('uses local time in the given zone, not the instant expressed in a different zone', () => {
    // 2026-08-25T22:00:00Z is already 2026-08-26 03:00 PKT (closed), even
    // though it's still 2026-08-25 in UTC — proves this isn't reading a
    // naive server-local hour.
    expect(isOpenAt(new Date('2026-08-25T22:00:00Z'))).toBe(false);
  });
});
