import { describe, expect, it } from 'vitest';
import { instantToZonedDateTime, zonedDateTimeToInstant } from '../../src/lib/business/zoned-time';

/**
 * These assertions are written against Abbottabad's real offset (UTC+5, no
 * DST) rather than against whatever the machine running them is set to —
 * the whole point of the helper is that the process timezone must not
 * matter.
 */
describe('zonedDateTimeToInstant', () => {
  it('reads a wall clock as Abbottabad time, not as UTC', () => {
    // The bug this exists to prevent: 19:00 must not become 19:00Z.
    expect(zonedDateTimeToInstant('2026-09-10', '19:00').toISOString()).toBe(
      '2026-09-10T14:00:00.000Z',
    );
  });

  it('rolls back to the previous UTC day for an early-morning local time', () => {
    // 01:00 in Abbottabad is still the day before in UTC — the case a naive
    // conversion gets wrong in a way that is easy to miss.
    expect(zonedDateTimeToInstant('2026-09-10', '01:00').toISOString()).toBe(
      '2026-09-09T20:00:00.000Z',
    );
  });

  it('handles local midnight without shifting a day', () => {
    expect(zonedDateTimeToInstant('2026-09-10', '00:00').toISOString()).toBe(
      '2026-09-09T19:00:00.000Z',
    );
  });

  it('handles the last minute of the local day', () => {
    expect(zonedDateTimeToInstant('2026-09-10', '23:59').toISOString()).toBe(
      '2026-09-10T18:59:00.000Z',
    );
  });

  it('rejects an unparseable date or time rather than producing an Invalid Date', () => {
    expect(() => zonedDateTimeToInstant('not-a-date', '19:00')).toThrow();
  });
});

describe('instantToZonedDateTime', () => {
  it('renders an instant as Abbottabad wall-clock time', () => {
    expect(instantToZonedDateTime(new Date('2026-09-10T14:00:00.000Z'))).toEqual({
      date: '2026-09-10',
      time: '19:00',
    });
  });

  it('reports the local date, which can be the next UTC day', () => {
    expect(instantToZonedDateTime(new Date('2026-09-09T20:00:00.000Z'))).toEqual({
      date: '2026-09-10',
      time: '01:00',
    });
  });

  it('renders local midnight as 00:00 on the correct date, never 24:00', () => {
    expect(instantToZonedDateTime(new Date('2026-09-09T19:00:00.000Z'))).toEqual({
      date: '2026-09-10',
      time: '00:00',
    });
  });
});

describe('round-tripping', () => {
  it('returns the original wall clock for every hour of a day', () => {
    // Any offset error shows up as a shifted hour somewhere in the day.
    for (let hour = 0; hour < 24; hour += 1) {
      const time = `${String(hour).padStart(2, '0')}:30`;
      const instant = zonedDateTimeToInstant('2026-09-10', time);
      expect(instantToZonedDateTime(instant)).toEqual({ date: '2026-09-10', time });
    }
  });

  it('round-trips across a month boundary', () => {
    const instant = zonedDateTimeToInstant('2026-10-01', '00:15');
    expect(instantToZonedDateTime(instant)).toEqual({ date: '2026-10-01', time: '00:15' });
  });

  it('round-trips a zone that does observe DST, on both sides of a transition', () => {
    // Guards the two-pass correction: Pakistan has no DST, so without a
    // zone that does, the second pass would be untested.
    const tz = 'Europe/London';
    for (const [date, time] of [
      ['2026-06-15', '13:45'], // BST
      ['2026-12-15', '13:45'], // GMT
    ] as const) {
      const instant = zonedDateTimeToInstant(date, time, tz);
      expect(instantToZonedDateTime(instant, tz)).toEqual({ date, time });
    }
  });
});
