import { describe, expect, it } from 'vitest';
import { isTodayOrFutureDate } from '../../src/modules/bookings/request-window';

describe('isTodayOrFutureDate', () => {
  it('accepts a future date', () => {
    expect(isTodayOrFutureDate('2026-09-01', new Date('2026-08-26T12:00:00Z'))).toBe(true);
  });

  it('accepts the current Abbottabad-local date', () => {
    // 2026-08-26T20:00:00Z = 2026-08-27 01:00 PKT (UTC+5) — already the 27th locally.
    expect(isTodayOrFutureDate('2026-08-27', new Date('2026-08-26T20:00:00Z'))).toBe(true);
  });

  it('rejects a past date', () => {
    expect(isTodayOrFutureDate('2026-08-01', new Date('2026-08-26T12:00:00Z'))).toBe(false);
  });

  it('rejects yesterday even a few minutes after local midnight', () => {
    // 2026-08-26T19:05:00Z = 2026-08-27 00:05 PKT — the 26th is now in the past locally.
    expect(isTodayOrFutureDate('2026-08-26', new Date('2026-08-26T19:05:00Z'))).toBe(false);
  });

  it('uses the given timezone, not the naive server-local date', () => {
    // 2026-08-26T23:00:00Z is still 2026-08-26 in UTC, but already
    // 2026-08-27 04:00 in Asia/Karachi (UTC+5) — proves this isn't reading
    // a naive server-local date.
    expect(isTodayOrFutureDate('2026-08-26', new Date('2026-08-26T23:00:00Z'))).toBe(false);
    expect(isTodayOrFutureDate('2026-08-27', new Date('2026-08-26T23:00:00Z'))).toBe(true);
  });
});
